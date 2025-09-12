/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { redesignRoom } from './services/geminiService';
import Header from './components/Header';
import ImageUploader from './components/ImageUploader';
import Spinner from './components/Spinner';
import DebugModal from './components/DebugModal';
import DrawingModal from './components/DrawingModal';
import TouchGhost from './components/TouchGhost';

// Helper to convert a data URL string to a File object
const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");

    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

// Helper to get intrinsic image dimensions from a File object
const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
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
                resolve({ width: img.naturalWidth, height: img.naturalHeight });
            };
            img.onerror = (err) => reject(new Error(`Image load error: ${err}`));
        };
        reader.onerror = (err) => reject(new Error(`File reader error: ${err}`));
    });
};


const loadingMessages = [
    "Analyzing your room's layout...",
    "Interpreting your creative sketch...",
    "Consulting with our AI interior designer...",
    "Painting the virtual walls...",
    "Arranging the new furniture...",
    "Rendering your beautiful new space..."
];

const UploadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
);

const App: React.FC = () => {
  const [sceneImage, setSceneImage] = useState<File | null>(null);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [sketchedImage, setSketchedImage] = useState<File | null>(null);
  const [generatedImage, setGeneratedImage] = useState<File | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  
  const [debugImageUrl, setDebugImageUrl] = useState<string | null>(null);
  const [debugPrompt, setDebugPrompt] = useState<string | null>(null);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [isDrawingModalOpen, setIsDrawingModalOpen] = useState(false);
  
  const [originalDimensions, setOriginalDimensions] = useState<{width: number, height: number} | null>(null);

  // Drag and drop state
  const [draggedProduct, setDraggedProduct] = useState<{ imageUrl: string } | null>(null);
  const [touchGhostPosition, setTouchGhostPosition] = useState<{ x: number; y: number } | null>(null);
  const [isProductDraggingOver, setIsProductDraggingOver] = useState<boolean>(false);
  const [dropCoordinates, setDropCoordinates] = useState<{ x: number, y: number } | null>(null);

  const sceneUploaderRef = useRef<HTMLImageElement>(null);

  const sceneImageUrl = sceneImage ? URL.createObjectURL(sceneImage) : null;
  const productImageUrl = productImage ? URL.createObjectURL(productImage) : null;
  const sketchedImageUrl = sketchedImage ? URL.createObjectURL(sketchedImage) : null;
  const generatedImageUrl = generatedImage ? URL.createObjectURL(generatedImage) : null;
  const displayImageUrl = generatedImageUrl || sketchedImageUrl || sceneImageUrl;
  
  // Effect to calculate and store the original dimensions of the user's uploaded scene
  useEffect(() => {
    if (sceneImage) {
        getImageDimensions(sceneImage)
            .then(setOriginalDimensions)
            .catch(err => {
                console.error("Could not get image dimensions:", err);
                setError("Could not read image dimensions. Please try a different image.");
            });
    } else {
        setOriginalDimensions(null);
    }
  }, [sceneImage]);

  const handleInstantStart = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('https://storage.googleapis.com/aistudio-web-public-prod/archidraw/scene.jpeg');
      if (!response.ok) {
        throw new Error('Failed to load default image');
      }
      const blob = await response.blob();
      const file = new File([blob], 'scene.jpeg', { type: 'image/jpeg' });
      setSceneImage(file);
      setPrompt('Make this room minimalist, with light wood furniture and lots of plants.');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Could not load default image. Details: ${errorMessage}`);
      console.error(err);
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    // The base image for the NEXT generation is the LATEST image we have.
    // Order is important: sketch > latest generated > original scene.
    const imageToProcess = sketchedImage || generatedImage || sceneImage;
    if (!imageToProcess || !prompt || !originalDimensions) {
      setError('Please upload a scene and provide a design prompt.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { finalImageUrl, debugImageUrl, finalPrompt } = await redesignRoom(
        imageToProcess,
        originalDimensions.width,
        originalDimensions.height,
        prompt,
        productImage,
        !!sketchedImage,
        dropCoordinates
      );
      
      const newGeneratedFile = dataURLtoFile(finalImageUrl, `generated-scene-${Date.now()}.jpeg`);
      
      // Set the new image as the latest version
      setGeneratedImage(newGeneratedFile);
      
      // Clear inputs that have been "used" in this generation step
      setSketchedImage(null);
      setProductImage(null);
      setDropCoordinates(null);
      setPrompt(''); // Clear prompt for the next command

      setDebugImageUrl(debugImageUrl);
      setDebugPrompt(finalPrompt);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Failed to generate the image. ${errorMessage}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [sceneImage, generatedImage, sketchedImage, prompt, productImage, dropCoordinates, originalDimensions]);


  const handleReset = useCallback(() => {
    setSceneImage(null);
    setProductImage(null);
    setSketchedImage(null);
    setGeneratedImage(null);
    setPrompt('');
    setError(null);
    setIsLoading(false);
    setDebugImageUrl(null);
    setDebugPrompt(null);
    setDropCoordinates(null);
    setOriginalDimensions(null);
  }, []);

  const handleSaveSketch = useCallback((dataUrl: string) => {
    const file = dataURLtoFile(dataUrl, `sketch-${Date.now()}.png`);
    setSketchedImage(file);
    setIsDrawingModalOpen(false);
  }, []);

  const handleRemoveSketch = () => {
    setSketchedImage(null);
  };

  const handleRemoveProduct = () => {
    setProductImage(null);
    setDropCoordinates(null);
  };
  
  // --- Drag and Drop Handlers ---
  
  const handleProductDragStart = (e: React.DragEvent) => {
    if (!productImageUrl) return;
    e.dataTransfer.setData('application/json', JSON.stringify({ isProduct: true }));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedProduct({ imageUrl: productImageUrl });
  };

  const handleProductDragEnd = () => {
      setDraggedProduct(null);
      setIsProductDraggingOver(false);
  };

  const handleSceneDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      if (draggedProduct) {
          setIsProductDraggingOver(true);
      }
  };

  const handleSceneDragLeave = () => {
      setIsProductDraggingOver(false);
  };
  
  const handleSceneDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsProductDraggingOver(false);

    const imgElement = sceneUploaderRef.current;
    if (!imgElement || !productImage) return;

    try {
        const productData = e.dataTransfer.getData('application/json');
        if (!productData) return;
        
        const rect = imgElement.getBoundingClientRect();
        const { naturalWidth, naturalHeight } = imgElement;
        const aspectRatio = naturalWidth / naturalHeight;
        const rectAspectRatio = rect.width / rect.height;

        let contentWidth = rect.width;
        let contentHeight = rect.height;
        let offsetX = 0;
        let offsetY = 0;

        if (aspectRatio > rectAspectRatio) { // Letterboxed
            contentHeight = rect.width / aspectRatio;
            offsetY = (rect.height - contentHeight) / 2;
        } else { // Pillarboxed
            contentWidth = rect.height * aspectRatio;
            offsetX = (rect.width - contentWidth) / 2;
        }

        const x = e.clientX - rect.left - offsetX;
        const y = e.clientY - rect.top - offsetY;

        if (x < 0 || x > contentWidth || y < 0 || y > contentHeight) {
            return;
        }

        const relativeX = x / contentWidth;
        const relativeY = y / contentHeight;
        
        setDropCoordinates({ x: relativeX, y: relativeY });

    } catch (err) {
        console.error("Drop failed:", err);
        setError("Failed to place the product. Please try again.");
    }
  };

  // --- Touch Handlers ---
  const handleProductTouchStart = (e: React.TouchEvent) => {
      if (!productImageUrl) return;
      setDraggedProduct({ imageUrl: productImageUrl });
      setTouchGhostPosition({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };
  
  const handleProductTouchMove = (e: React.TouchEvent) => {
      if (!draggedProduct) return;
      e.preventDefault();
      setTouchGhostPosition({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };
  
  const handleProductTouchEnd = (e: React.TouchEvent) => {
      if (!draggedProduct) return;
      
      const touch = e.changedTouches[0];
      const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
      
      if (dropTarget && dropTarget.closest('[data-dropzone-id="scene-uploader"]')) {
          const dropEvent = new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              clientX: touch.clientX,
              clientY: touch.clientY,
          });
          Object.defineProperty(dropEvent, 'dataTransfer', {
              value: {
                  getData: () => JSON.stringify({ isProduct: true })
              }
          });
          dropTarget.dispatchEvent(dropEvent);
      }
      setDraggedProduct(null);
      setTouchGhostPosition(null);
  };
  
  useEffect(() => {
    return () => {
        if (sceneImageUrl) URL.revokeObjectURL(sceneImageUrl);
        if (productImageUrl) URL.revokeObjectURL(productImageUrl);
        if (sketchedImageUrl) URL.revokeObjectURL(sketchedImageUrl);
        if (generatedImageUrl) URL.revokeObjectURL(generatedImageUrl);
    };
  }, [sceneImageUrl, productImageUrl, sketchedImageUrl, generatedImageUrl]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isLoading) {
        setLoadingMessageIndex(0); // Reset on start
        interval = setInterval(() => {
            setLoadingMessageIndex(prevIndex => (prevIndex + 1) % loadingMessages.length);
        }, 3000);
    }
    return () => {
        if (interval) clearInterval(interval);
    };
  }, [isLoading]);
  
  const renderContent = () => {
    if (error) {
       return (
           <div className="text-center animate-fade-in bg-red-50 border border-red-200 p-8 rounded-xl max-w-2xl mx-auto">
            <h2 className="text-3xl font-extrabold mb-4 text-red-800">An Error Occurred</h2>
            <p className="text-lg text-red-700 mb-6">{error}</p>
            <button
                onClick={handleReset}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors"
              >
                Try Again
            </button>
          </div>
        );
    }
    
    if (!sceneImage) {
        return (
            <div className="w-full max-w-2xl mx-auto text-center animate-fade-in">
                <ImageUploader 
                    id="scene-uploader"
                    onFileSelect={(file) => { setSceneImage(file); setSketchedImage(null); setGeneratedImage(null); }}
                    imageUrl={null}
                    disabled={false}
                />
                <div className="mt-6">
                    <p className="text-slate-500">
                        Upload a photo of your room to get started.
                    </p>
                    <p className="text-slate-500 mt-2">
                        Or click{' '}
                        <button
                            onClick={handleInstantStart}
                            className="font-bold text-blue-600 hover:text-blue-800 underline transition-colors"
                        >
                            here
                        </button>
                        {' '}for an instant start.
                    </p>
                </div>
            </div>
        );
    }
    
    return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 animate-fade-in">
        {/* Left Column: Image Viewer */}
        <div className="lg:col-span-3">
             <div className="relative">
                <ImageUploader 
                    ref={sceneUploaderRef}
                    id="scene-uploader"
                    onFileSelect={() => {}} // Disallow changing image here, use Start Over
                    imageUrl={displayImageUrl}
                    disabled={isLoading}
                    showDebugButton={!!debugImageUrl && !isLoading}
                    onDebugClick={() => setIsDebugModalOpen(true)}
                    isProductDraggingOver={isProductDraggingOver}
                    onProductDragOver={handleSceneDragOver}
                    onProductDragLeave={handleSceneDragLeave}
                    onProductDrop={handleSceneDrop}
                />
                 {productImageUrl && dropCoordinates && (
                    <img
                        src={productImageUrl}
                        alt="Dropped product"
                        className="absolute w-20 h-20 object-contain pointer-events-none transition-all animate-fade-in"
                        style={{
                            left: `${dropCoordinates.x * 100}%`,
                            top: `${dropCoordinates.y * 100}%`,
                            transform: 'translate(-50%, -50%)',
                        }}
                    />
                )}
            </div>
            <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-4">
                    {!sketchedImage && (
                         <button 
                            onClick={() => setIsDrawingModalOpen(true)}
                            className="bg-white hover:bg-slate-100 text-slate-800 font-semibold py-2 px-4 rounded-lg text-sm transition-colors border border-slate-300 shadow-sm disabled:opacity-50"
                            disabled={isLoading}
                        >
                            ✏️ Add Sketch
                        </button>
                    )}
                    {sketchedImage && (
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => setIsDrawingModalOpen(true)}
                                className="font-semibold text-blue-600 hover:text-blue-800 transition-colors text-sm disabled:opacity-50"
                                disabled={isLoading}
                            >
                                Edit Sketch
                            </button>
                            <button
                                onClick={handleRemoveSketch}
                                className="text-sm text-red-600 hover:text-red-800 font-semibold disabled:opacity-50"
                                disabled={isLoading}
                            >
                                Remove Sketch
                            </button>
                        </div>
                    )}
                </div>
                 <button
                      onClick={handleReset}
                      className="text-sm text-blue-600 hover:text-blue-800 font-semibold disabled:opacity-50"
                      disabled={isLoading}
                  >
                      Start Over
                  </button>
            </div>
        </div>

        {/* Right Column: Controls */}
        <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg p-6 sticky top-8 flex flex-col gap-6">
                {isLoading ? (
                    <div className="animate-fade-in text-center py-10">
                        <Spinner />
                        <p className="text-lg mt-4 text-slate-600 transition-opacity duration-500">{loadingMessages[loadingMessageIndex]}</p>
                    </div>
                ) : (
                <>
                    {/* Step 2: Product Uploader */}
                    <div className="flex flex-col">
                        <h2 className="text-xl font-bold text-slate-800">1. Add a Product (Optional)</h2>
                        {productImage && productImageUrl ? (
                            <div className="mt-4 text-center">
                                <div className="relative inline-block group">
                                    <div 
                                        className="relative bg-slate-50 p-2 border-2 border-dashed border-slate-300 rounded-lg cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                                        draggable="true"
                                        onDragStart={handleProductDragStart}
                                        onDragEnd={handleProductDragEnd}
                                        onTouchStart={handleProductTouchStart}
                                        onTouchMove={handleProductTouchMove}
                                        onTouchEnd={handleProductTouchEnd}
                                    >
                                        <img src={productImageUrl} alt="Uploaded product" className="w-32 h-32 object-contain" />
                                    </div>
                                    <button
                                        onClick={handleRemoveProduct}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full h-6 w-6 flex items-center justify-center text-lg opacity-0 group-hover:opacity-100 transition-opacity transform hover:scale-110"
                                        aria-label="Remove Product"
                                    >
                                        &times;
                                    </button>
                                </div>
                                <p className="text-slate-500 mt-2 text-sm">Drag the product onto your room image.</p>
                            </div>
                        ) : (
                            <div className="mt-4">
                                <label htmlFor="product-uploader-input" className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-lg cursor-pointer transition-colors border border-slate-300">
                                    <UploadIcon />
                                    Upload from device
                                </label>
                                <input
                                    type="file"
                                    id="product-uploader-input"
                                    onChange={(e) => { const file = e.target.files?.[0]; if (file) setProductImage(file); }}
                                    accept="image/png, image/jpeg, image/webp"
                                    className="hidden"
                                />
                            </div>
                        )}
                    </div>

                    {/* Step 3: Prompt */}
                    <div className="flex flex-col">
                        <h2 className="text-xl font-bold text-slate-800">
                            2. Describe Your Vision
                        </h2>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="e.g., 'Make it a cozy, rustic living room with a stone fireplace.'"
                            className="mt-4 w-full h-32 p-4 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white"
                            aria-label="Design vision prompt"
                        />
                    </div>

                    {/* Generate Button */}
                    <div className="mt-2">
                        <button
                            onClick={handleGenerate}
                            disabled={!prompt.trim()}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg transition-all disabled:bg-slate-400 disabled:cursor-not-allowed transform hover:scale-105"
                        >
                            Generate Design
                        </button>
                    </div>
                </>
                )}
            </div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <Header />
        <main className="mt-8">
          {renderContent()}
        </main>
      </div>
      <TouchGhost
          imageUrl={draggedProduct?.imageUrl ?? null}
          position={touchGhostPosition}
      />
      <DebugModal 
        isOpen={isDebugModalOpen} 
        onClose={() => setIsDebugModalOpen(false)}
        imageUrl={debugImageUrl}
        prompt={debugPrompt}
      />
      {displayImageUrl && (
        <DrawingModal
            isOpen={isDrawingModalOpen}
            onClose={() => setIsDrawingModalOpen(false)}
            onSave={handleSaveSketch}
            backgroundImageUrl={displayImageUrl}
        />
      )}
    </div>
  );
};

export default App;