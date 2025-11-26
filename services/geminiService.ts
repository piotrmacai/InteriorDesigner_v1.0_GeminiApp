/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";

// Helper to crop a square image back to an original aspect ratio, removing padding.
const cropToOriginalAspectRatio = (
    imageDataUrl: string,
    originalWidth: number,
    originalHeight: number,
    targetDimension: number
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = imageDataUrl;
        img.onload = () => {
            // Re-calculate the dimensions of the content area within the padded square image
            const aspectRatio = originalWidth / originalHeight;
            let contentWidth, contentHeight;
            if (aspectRatio > 1) { // Landscape
                contentWidth = targetDimension;
                contentHeight = targetDimension / aspectRatio;
            } else { // Portrait or square
                contentHeight = targetDimension;
                contentWidth = targetDimension * aspectRatio;
            }

            // Calculate the top-left offset of the content area
            const x = (targetDimension - contentWidth) / 2;
            const y = (targetDimension - contentHeight) / 2;

            const canvas = document.createElement('canvas');
            // Set canvas to the final, un-padded dimensions
            canvas.width = contentWidth;
            canvas.height = contentHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context for cropping.'));
            }
            
            // Draw the relevant part of the square generated image onto the new, smaller canvas
            ctx.drawImage(img, x, y, contentWidth, contentHeight, 0, 0, contentWidth, contentHeight);
            
            // Return the data URL of the newly cropped image
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = (err) => reject(new Error(`Image load error during cropping: ${err}`));
    });
};


// New resize logic inspired by the reference to enforce a consistent aspect ratio without cropping.
// It resizes the image to fit within a square and adds padding, ensuring a consistent
// input size for the AI model, which enhances stability.
const resizeImage = (file: File, targetDimension: number): Promise<File> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            if (!event.target?.result) {
                return reject(new Error("Failed to read file."));
            }
            const img = new Image();
            img.src = event.target.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = targetDimension;
                canvas.height = targetDimension;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Could not get canvas context.'));
                }

                // Fill the canvas with a neutral background to avoid transparency issues
                // and ensure a consistent input format for the model.
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, targetDimension, targetDimension);

                // Calculate new dimensions to fit inside the square canvas while maintaining aspect ratio
                const aspectRatio = img.width / img.height;
                let newWidth, newHeight;

                if (aspectRatio > 1) { // Landscape image
                    newWidth = targetDimension;
                    newHeight = targetDimension / aspectRatio;
                } else { // Portrait or square image
                    newHeight = targetDimension;
                    newWidth = targetDimension * aspectRatio;
                }

                // Calculate position to center the image on the canvas
                const x = (targetDimension - newWidth) / 2;
                const y = (targetDimension - newHeight) / 2;
                
                // Draw the resized image onto the centered position
                ctx.drawImage(img, x, y, newWidth, newHeight);

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(new File([blob], file.name, {
                            type: 'image/jpeg', // Force jpeg to handle padding color consistently
                            lastModified: Date.now()
                        }));
                    } else {
                        reject(new Error('Canvas to Blob conversion failed.'));
                    }
                }, 'image/jpeg', 0.95);
            };
            img.onerror = (err) => reject(new Error(`Image load error: ${err}`));
        };
        reader.onerror = (err) => reject(new Error(`File reader error: ${err}`));
    });
};

// Helper to convert a File object to a Gemini API Part
const fileToPart = async (file: File): Promise<{ inlineData: { mimeType: string; data: string; } }> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
    
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");
    
    const mimeType = mimeMatch[1];
    const data = arr[1];
    return { inlineData: { mimeType, data } };
};

// Helper to convert File to a data URL string
const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

/**
 * Generates a new room design using a multi-modal AI model.
 * @param imageToProcess The file for the room/scene to be redesigned (current state).
 * @param originalImage The original user-uploaded file (ground truth for structure).
 * @param originalWidth Width of the original image.
 * @param originalHeight Height of the original image.
 * @param userPrompt Description of changes.
 * @param productImage Optional product to add.
 * @param isSketched Boolean if sketched.
 * @param isSceneryChange Boolean if this is a scenery swap only.
 */
export const redesignRoom = async (
    imageToProcess: File,
    originalImage: File,
    originalWidth: number,
    originalHeight: number,
    userPrompt: string,
    productImage: File | null,
    isSketched: boolean,
    isSceneryChange: boolean = false,
): Promise<{ finalImageUrl: string; debugImageUrl: string; finalPrompt: string; }> => {
  console.log('Starting enterprise architecture design process...');
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  
  // Define standard dimension for model inputs
  const MAX_DIMENSION = 1024;
  
  // STEP 1: Prepare images
  console.log('Resizing input images...');
  const resizedCurrentImage = await resizeImage(imageToProcess, MAX_DIMENSION);
  
  // Create parts array.
  // We prioritize the current state for editing, but we reference the original for structure.
  const parts: any[] = [];
  
  // Check if current image is different from original (meaning we are in an edit loop)
  // We compare by name/size roughly, or just assume if they are different files passed in.
  const isIterativeEdit = imageToProcess !== originalImage;

  if (isIterativeEdit && !isSceneryChange) {
      // If we are iterating, we pass the original as context for structure, 
      // and the current as the target to modify.
      const resizedOriginalImage = await resizeImage(originalImage, MAX_DIMENSION);
      
      // Part 1: Original Structure Reference
      parts.push(await fileToPart(resizedOriginalImage)); 
      
      // Part 2: Current State
      parts.push(await fileToPart(resizedCurrentImage));
  } else {
      // First run OR Scenery change (where we primarily want to act on the current look)
      parts.push(await fileToPart(resizedCurrentImage));
  }

  // Debug URL is the image effectively being edited
  const debugImageUrl = await fileToDataUrl(resizedCurrentImage);

  // STEP 2: Construct Enterprise-Grade Prompt
  let systemInstruction = `You are a World-Class AI Architect and Visualizer.
Your goal is to produce photorealistic, enterprise-grade architectural visualizations.
You strictly adhere to structural integrity. 
`;

  let prompt = `**Operation:** ${isSceneryChange ? 'ENVIRONMENT_SWAP' : 'ARCHITECTURAL_EDIT'}

**Reference Context:**
${isIterativeEdit && !isSceneryChange ? 'Image 1 is the ORIGINAL GROUND TRUTH. Image 2 is the CURRENT DESIGN STATE.' : 'The provided image is the source.'}

**Strict Directives:**
1.  **Structural Constancy:** Do NOT alter the physical structure of the building (walls, rooflines, windows, perspective) unless explicitly instructed to "renovate" or "extend". The original geometry is sacred.
2.  **Photorealism:** The output must be indistinguishable from a high-end architectural photograph. Lighting, shadows, and textures must be physically accurate.
3.  **Instruction Following:** Execute the user's prompt exactly. Do not add unsolicited elements.
`;

  if (isSceneryChange) {
      prompt += `
**Task: Scenery/Background Replacement**
- Change the environment/background to match the description: "${userPrompt}".
- **CRITICAL:** The main subject (house/room/furniture) MUST remain exactly identical to the input image. Only the sky, weather, lighting, and surrounding landscape should change.
- Seamlessly blend the new lighting conditions onto the existing structure.
`;
  } else if (isSketched) {
      prompt += `
**Task: Sketch-Guided Edit**
- The provided image contains a user-drawn sketch.
- **CRITICAL:** Edit ONLY the areas covered by the sketch markings.
- Apply the instruction "${userPrompt}" strictly within the sketched zones.
- The rest of the image must remain pixel-perfectly identical to the source.
`;
  } else {
      prompt += `
**Task: Design Modification**
- User Instruction: "${userPrompt}"
- Integrate these changes naturally.
- If the instruction implies adding an object (e.g. "add a pool"), ensure perspective matches perfectly.
`;
  }

  if (productImage) {
      parts.push(await fileToPart(productImage));
      prompt += `
**Task: Product Integration**
- An additional image of a specific product is provided.
- Place this product into the scene realistically.
- Scale and rotate it to match the scene's perspective.
`;
  }

  const textPart = { text: prompt };
  parts.push(textPart);

  console.log('Sending payload to model...', { isIterativeEdit, isSceneryChange });
  
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts },
    config: {
      responseModalities: [Modality.IMAGE],
      systemInstruction: systemInstruction,
    },
  });

  const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

  if (imagePartFromResponse?.inlineData) {
    const { mimeType, data } = imagePartFromResponse.inlineData;
    const generatedSquareImageUrl = `data:${mimeType};base64,${data}`;
    
    const finalImageUrl = await cropToOriginalAspectRatio(
        generatedSquareImageUrl,
        originalWidth,
        originalHeight,
        MAX_DIMENSION
    );
    
    return { finalImageUrl, debugImageUrl, finalPrompt: prompt };
  }

  throw new Error("The AI model did not return an image. Please try again.");
};

export const generateRotatedView = async (
    currentImage: File,
    originalWidth: number,
    originalHeight: number,
    direction: 'left' | 'right'
): Promise<{ finalImageUrl: string; }> => {
    console.log(`Generating rotated view to the ${direction}...`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    const MAX_DIMENSION = 1024;
    
    const resizedImage = await resizeImage(currentImage, MAX_DIMENSION);
    const imagePart = await fileToPart(resizedImage);
    
    const prompt = `**Role:** Enterprise Architectural Visualizer.
**Task:** Generate a consistent view rotation (20 degrees ${direction}).
**Directives:**
- Maintain absolute fidelity to the architectural style and materials of the source image.
- This is a 3D perspective shift. Reveal what would logically be visible from the new angle.
- High-quality, photorealistic output only.
`;
    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [imagePart, textPart] },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });
    
    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        const generatedSquareImageUrl = `data:${mimeType};base64,${data}`;
        
        const finalImageUrl = await cropToOriginalAspectRatio(
            generatedSquareImageUrl,
            originalWidth,
            originalHeight,
            MAX_DIMENSION
        );
        return { finalImageUrl };
    }
    
    throw new Error("The AI model did not return an image for rotation.");
};
