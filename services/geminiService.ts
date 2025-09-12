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

const drawMarkerOnImage = (
    imageFile: File,
    coords: { x: number; y: number },
): Promise<File> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        reader.onload = (event) => {
            if (!event.target?.result) {
                return reject(new Error("Failed to read file for marker drawing."));
            }
            const img = new Image();
            img.src = event.target.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Could not get canvas context for marker.'));
                }

                ctx.drawImage(img, 0, 0, img.width, img.height);
                
                ctx.beginPath();
                ctx.arc(coords.x, coords.y, 10, 0, 2 * Math.PI, false); // 10px radius circle
                ctx.fillStyle = 'red';
                ctx.fill();
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.stroke();

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(new File([blob], imageFile.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        }));
                    } else {
                        reject(new Error('Canvas to Blob conversion failed for marker image.'));
                    }
                }, 'image/jpeg', 0.95);
            };
            img.onerror = (err) => reject(new Error(`Image load error for marker: ${err}`));
        };
        reader.onerror = (err) => reject(new Error(`File reader error for marker: ${err}`));
    });
};

// Helper function to convert a File object to a Gemini API Part
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
 * @param imageToProcess The file for the room/scene to be redesigned (could be original, sketched, or previously generated).
 * @param originalWidth The width of the very first user-uploaded image, used for final cropping.
 * @param originalHeight The height of the very first user-uploaded image, used for final cropping.
 * @param userPrompt A text description of the desired design changes.
 * @param productImage An optional file for a specific product to include in the design.
 * @param isSketched A boolean indicating if the imageToProcess contains a user sketch.
 * @param dropCoordinates The relative (0-1) coordinates where the product was dropped.
 * @returns A promise that resolves to an object containing the data URL of the generated image and debug info.
 */
export const redesignRoom = async (
    imageToProcess: File,
    originalWidth: number,
    originalHeight: number,
    userPrompt: string,
    productImage: File | null,
    isSketched: boolean,
    dropCoordinates: { x: number; y: number } | null
): Promise<{ finalImageUrl: string; debugImageUrl: string; finalPrompt: string; }> => {
  console.log('Starting room redesign process...');
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  
  // Define standard dimension for model inputs
  const MAX_DIMENSION = 1024;
  
  // STEP 1: Prepare image by resizing
  console.log('Resizing room image...');
  const resizedRoomImage = await resizeImage(imageToProcess, MAX_DIMENSION);

  let imageToSend = resizedRoomImage;

  if (productImage && dropCoordinates) {
      console.log('Calculating marker position...');
      // Calculate content area within the padded MAX_DIMENSION square
      const aspectRatio = originalWidth / originalHeight;
      let contentWidth, contentHeight;
      if (aspectRatio > 1) { // Landscape
          contentWidth = MAX_DIMENSION;
          contentHeight = MAX_DIMENSION / aspectRatio;
      } else { // Portrait or square
          contentHeight = MAX_DIMENSION;
          contentWidth = MAX_DIMENSION * aspectRatio;
      }
      const x_offset = (MAX_DIMENSION - contentWidth) / 2;
      const y_offset = (MAX_DIMENSION - contentHeight) / 2;

      // Calculate absolute marker coords on the canvas
      const markerX = x_offset + dropCoordinates.x * contentWidth;
      const markerY = y_offset + dropCoordinates.y * contentHeight;

      console.log('Drawing marker on image for product placement...');
      imageToSend = await drawMarkerOnImage(resizedRoomImage, { x: markerX, y: markerY });
  }

  const debugImageUrl = await fileToDataUrl(imageToSend);
  
  // STEP 2: Generate composite image using the resized image and the prompt
  console.log('Preparing to generate new room design...');

  const parts: ({ inlineData: { mimeType: string; data: string; }; } | { text: string; })[] = [await fileToPart(imageToSend)];
  
  let prompt = `**Role and Goal:**
You are an expert AI interior designer. Your goal is to create a photorealistic redesign of the provided room image, strictly following all user instructions and constraints.

**Critical Rule: Preserve Architecture**
This is your most important instruction. You MUST NOT alter the original room's architectural elements.
-   **DO NOT CHANGE:** walls, windows, doors, the ceiling, or any structural features. Their position, size, and shape must remain identical to the original image.
-   **MAINTAIN:** The room's layout, dimensions, and the original camera perspective.
-   Any part of the room visible in the original image must be present in the output, simply redesigned according to the user's style.
-   The provided base image may have black padding; this padding should be ignored. The room content is what matters.

**User's Design Vision:**
Redesign the room to match this style: "${userPrompt}"
`;
  
  if (isSketched) {
      prompt += `
**Sketch Instructions:**
The user has provided a sketch on top of the room image. This sketch is a direct command that takes precedence.
-   You MUST interpret the drawn shapes and lines as new objects or design elements.
-   Transform these drawings into photorealistic objects that fit the requested style. For example, a drawn rectangle on the floor becomes a rug; a scribble by a window becomes a plant.
-   Your main creative task is to realize the user's sketched ideas photorealistically.
`;
  }

  if (productImage) {
      console.log('Adding product image to request...');
      parts.push(await fileToPart(productImage));
      prompt += `
**Product Inclusion:**
A second image contains a specific product. You MUST integrate this exact product into the redesigned room.
-   Ensure the product's scale, lighting, and perspective are seamlessly blended into the scene to look realistic.
`;
      if (dropCoordinates) {
          prompt += `-   A small red dot on the main room image indicates the desired placement location. Place the product at this location, ensuring it integrates naturally. The red dot itself should be painted over and not visible in the final image.
`;
      }
  }

  prompt += `
**Final Output Requirements:**
-   The output must be a single, high-quality, photorealistic image.
-   Your output should be a complete replacement of the original room's interior, rendered in the new style.
-   The image should contain ONLY the redesigned room. No text, logos, or other artifacts.
`;

  const textPart = { text: prompt };
  parts.push(textPart);

  console.log('Sending image(s) and prompt to the model...');
  
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image-preview',
    contents: { parts },
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
    },
  });

  console.log('Received response from model.');
  
  const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

  if (imagePartFromResponse?.inlineData) {
    const { mimeType, data } = imagePartFromResponse.inlineData;
    console.log(`Received image data (${mimeType}), length:`, data.length);
    const generatedSquareImageUrl = `data:${mimeType};base64,${data}`;
    
    console.log('Cropping generated image to original aspect ratio...');
    const finalImageUrl = await cropToOriginalAspectRatio(
        generatedSquareImageUrl,
        originalWidth,
        originalHeight,
        MAX_DIMENSION
    );
    
    return { finalImageUrl, debugImageUrl, finalPrompt: prompt };
  }

  console.error("Model response did not contain an image part.", response);
  throw new Error("The AI model did not return an image. Please try again.");
};