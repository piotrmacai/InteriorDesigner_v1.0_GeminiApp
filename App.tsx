/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { redesignRoom, generateRotatedView } from './services/geminiService';
import { saveSessionsToLocalStorage, loadSessionsFromLocalStorage } from './services/storageService';
import { getImageDimensions } from './utils/fileUtils';
import Header from './components/Header';
import ImageUploader from './components/ImageUploader';
import Spinner from './components/Spinner';
import DebugModal from './components/DebugModal';
import DrawingModal from './components/DrawingModal';
import AddProductModal from './components/AddProductModal';
import SceneryModal from './components/SceneryModal';
import HistorySidebar from './components/HistorySidebar';
import { DesignSession } from './types';

const loadingMessages = [
    "Consulting AI Architect...",
    "Analyzing Structural Geometry...",
    "Applying Photorealistic Textures...",
    "Adjusting Lighting & Atmosphere...",
    "Rendering High-Fidelity Output...",
    "Finalizing Architectural Details...",
];

const ArrowLeftIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M15 18l-6-6 6-6"/></svg>
);

const ArrowRightIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M9 18l6-6-6-6"/></svg>
);

const UndoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M21 9H6.47a2 2 0 0 0-1.79 1.11L2 16"/><path d="M6 13 2 16l4 3"/></svg>
);

const RedoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M3 9h14.53a2 2 0 0 1 1.79 1.11L22 16"/><path d="M18 13l4 3-4 3"/></svg>
);

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
);

const SceneryIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
);

const App: React.FC = () => {
  // Session management state
  const [sessions, setSessions] = useState<DesignSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // Active session's working state
  const [sceneImage, setSceneImage] = useState<File | null>(null);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [sketchedImage, setSketchedImage] = useState<File | null>(null);
  const [history, setHistory] = useState<File[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [prompt, setPrompt] = useState<string>('');
  const [originalDimensions, setOriginalDimensions] = useState<{width: number, height: number} | null>(null);

  // UI state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  
  const [debugImageUrl, setDebugImageUrl] = useState<string | null>(null);
  const [debugPrompt, setDebugPrompt] = useState<string | null>(null);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [isDrawingModalOpen, setIsDrawingModalOpen] = useState(false);
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [isSceneryModalOpen, setIsSceneryModalOpen] = useState(false);

  const sceneUploaderRef = useRef<HTMLImageElement>(null);

  const currentGeneratedImage = history[historyIndex] ?? null;
  
  const sceneImageUrl = sceneImage ? URL.createObjectURL(sceneImage) : null;
  const sketchedImageUrl = sketchedImage ? URL.createObjectURL(sketchedImage) : null;
  const generatedImageUrl = currentGeneratedImage ? URL.createObjectURL(currentGeneratedImage) : null;
  const displayImageUrl = generatedImageUrl || sketchedImageUrl || sceneImageUrl;
  
  // Effect to cycle loading messages
  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setLoadingMessageIndex((prevIndex) => (prevIndex + 1) % loadingMessages.length);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  // Effect for loading/saving sessions from/to local storage
  useEffect(() => {
    loadSessionsFromLocalStorage().then(loadedSessions => {
      setSessions(loadedSessions);
      if (loadedSessions.length > 0) {
        // Activate the most recent session
        handleSelectSession(loadedSessions[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (sessions.length > 0) {
      saveSessionsToLocalStorage(sessions);
    }
  }, [sessions]);


  const clearWorkingState = () => {
    setSceneImage(null);
    setProductImage(null);
    setSketchedImage(null);
    setHistory([]);
    setHistoryIndex(-1);
    setPrompt('');
    setError(null);
    setIsLoading(false);
    setDebugImageUrl(null);
    setDebugPrompt(null);
    setOriginalDimensions(null);
  }

  const handleNewProject = useCallback(() => {
    clearWorkingState();
    setActiveSessionId(null);
  }, []);
  
  const handleSelectSession = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      clearWorkingState();
      setSceneImage(session.sceneImage);
      setOriginalDimensions(session.originalDimensions);
      setHistory(session.generations);
      setHistoryIndex(session.generations.length - 1);
      setActiveSessionId(session.id);
    }
  }, [sessions]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      const remainingSessions = sessions.filter(s => s.id !== sessionId);
      if (remainingSessions.length > 0) {
        handleSelectSession(remainingSessions[0].id);
      } else {
        handleNewProject();
      }
    }
  }, [activeSessionId, sessions, handleSelectSession, handleNewProject]);

  const handleSceneImageUpload = async (file: File) => {
    try {
      const dimensions = await getImageDimensions(file);
      const thumbnailReader = new FileReader();
      thumbnailReader.readAsDataURL(file);
      thumbnailReader.onload = () => {
        const newSession: DesignSession = {
          id: Date.now().toString(),
          name: `Design ${sessions.length + 1}`,
          timestamp: Date.now(),
          thumbnail: thumbnailReader.result as string,
          sceneImage: file,
          originalDimensions: dimensions,
          generations: []
        };
        
        setSessions(prev => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        
        // Load this new session into the working state
        setSceneImage(file);
        setOriginalDimensions(dimensions);
        setHistory([]);
        setHistoryIndex(-1);
        setPrompt('');
        setSketchedImage(null);
        setProductImage(null);
        setError(null);
      }
    } catch(err) {
      console.error("Could not create new session:", err);
      setError("Could not read image dimensions. Please try a different image.");
    }
  };

  const handleInstantStart = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('https://storage.googleapis.com/aistudio-web-public-prod/prompts/v1/exterior.jpeg');
      if (!response.ok) {
        throw new Error('Failed to load default image');
      }
      const blob = await response.blob();
      const file = new File([blob], 'exterior.jpeg', { type: 'image/jpeg' });
      await handleSceneImageUpload(file);
      setPrompt('Add a modern stone pathway, plant vibrant flowerbeds along the front, and add a large oak tree on the right.');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Could not load default image. Details: ${errorMessage}`);
      console.error(err);
    }
  }, [sessions]);
  
  const addImageToHistory = (newImage: File) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newImage);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);

    if (activeSessionId) {
      setSessions(prevSessions => prevSessions.map(s => 
        s.id === activeSessionId ? { ...s, generations: newHistory } : s
      ));
    }
  };

  const executeGeneration = async (customPrompt: string = prompt, isScenery: boolean = false) => {
    // Current working image is either sketch, last generation, or original
    const imageToProcess = sketchedImage || currentGeneratedImage || sceneImage;
    
    // We also need the strict original for structural reference
    const originalReference = sceneImage;

    if (!imageToProcess || !originalReference || !customPrompt || !originalDimensions) {
      setError('Missing project data. Please ensure an image is uploaded.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { finalImageUrl, debugImageUrl: debugUrl, finalPrompt } = await redesignRoom(
        imageToProcess,
        originalReference, // ALWAYS pass the original for structural grounding
        originalDimensions.width,
        originalDimensions.height,
        customPrompt,
        productImage,
        !!sketchedImage,
        isScenery
      );
      
      const newGeneratedFile = await (await fetch(finalImageUrl)).blob().then(blob => new File([blob], `generated-scene-${Date.now()}.jpeg`, {type: 'image/jpeg'}));
      
      addImageToHistory(newGeneratedFile);
      
      // Cleanup one-time states
      setSketchedImage(null);
      setProductImage(null);
      if (!isScenery) setPrompt('');

      setDebugImageUrl(debugUrl);
      setDebugPrompt(finalPrompt);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Failed to generate the image. ${errorMessage}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = useCallback(() => {
      executeGeneration(prompt, false);
  }, [prompt, sketchedImage, currentGeneratedImage, sceneImage, productImage, originalDimensions]);

  const handleSceneryChange = useCallback((sceneryPrompt: string) => {
      executeGeneration(sceneryPrompt, true);
      setIsSceneryModalOpen(false);
  }, [sketchedImage, currentGeneratedImage, sceneImage, productImage, originalDimensions]);

  const handleRotateView = useCallback(async (direction: 'left' | 'right') => {
    const imageToRotate = currentGeneratedImage;
    if (!imageToRotate || !originalDimensions) {
      setError('A generated image must exist to create a rotated view.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
        const { finalImageUrl } = await generateRotatedView(
            imageToRotate,
            originalDimensions.width,
            originalDimensions.height,
            direction
        );
        const newRotatedFile = await (await fetch(finalImageUrl)).blob().then(blob => new File([blob], `rotated-scene-${Date.now()}.jpeg`, {type: 'image/jpeg'}));
        addImageToHistory(newRotatedFile);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to generate the rotated view. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentGeneratedImage, originalDimensions, history, historyIndex, activeSessionId]);

  const handleRevertToOriginal = useCallback(() => {
    setHistory([]);
    setHistoryIndex(-1);
    setSketchedImage(null);
    if (activeSessionId) {
      setSessions(prev => prev.map(s => 
        s.id === activeSessionId ? { ...s, generations: [] } : s
      ));
    }
  }, [activeSessionId]);

  const handleSaveSketch = useCallback(async (dataUrl: string) => {
    const file = await (await fetch(dataUrl)).blob().then(blob => new File([blob], `sketch-${Date.now()}.png`, {type: 'image/png'}));
    setSketchedImage(file);
    setIsDrawingModalOpen(false);
  }, []);
  
  const handleDownload = () => {
    if (!generatedImageUrl) return;
    const link = document.createElement('a');
    link.href = generatedImageUrl;
    link.download = `design-${Date.now()}.jpeg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleUndo = () => historyIndex >= 0 && setHistoryIndex(historyIndex - 1);
  const handleRedo = () => historyIndex < history.length - 1 && setHistoryIndex(historyIndex + 1);
  const handleRemoveSketch = () => setSketchedImage(null);
  const handleRemoveProduct = () => setProductImage(null);
  
  const handleAddCustomProduct = (file: File) => {
    setProductImage(file);
    setIsAddProductModalOpen(false);
  };
  
  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900 font-sans">
      <Header onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
      <div className="w-full max-w-8xl mx-auto flex flex-1 overflow-hidden px-4 sm:px-6 md:px-8">
        <HistorySidebar 
          isOpen={isSidebarOpen}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewProject}
          onDeleteSession={handleDeleteSession}
        />
        <main className={`flex-1 flex flex-col items-center p-0 sm:p-2 md:p-4 transition-all duration-300 ${isSidebarOpen ? 'md:ml-72' : 'ml-0'}`}>
          <div className="w-full max-w-5xl mx-auto flex flex-col gap-6">
            
            {/* Main Workspace Card */}
            <div className={`relative p-1 sm:p-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 transition-opacity duration-500 flex flex-col ${isLoading ? 'opacity-60 pointer-events-none' : ''}`}>
              
              {/* Toolbar */}
              {(history.length > 0 || sketchedImage || sceneImage) && (
                 <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 mb-2">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Tools</span>
                        <div className="h-4 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>
                         <button onClick={() => setIsDrawingModalOpen(true)} className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                            Sketch
                        </button>
                        <button onClick={() => setIsAddProductModalOpen(true)} className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 transition-colors ml-3">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                             Add Product
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-2">
                         <button onClick={handleUndo} disabled={!canUndo} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-30 transition-colors"><UndoIcon /></button>
                         <button onClick={handleRedo} disabled={!canRedo} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-30 transition-colors"><RedoIcon /></button>
                         <div className="h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>
                         <button onClick={handleRevertToOriginal} className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 hover:text-red-600 transition-colors" title="Revert to Original"><TrashIcon /></button>
                    </div>
                 </div>
              )}

              <div className="relative group w-full bg-gray-50 dark:bg-gray-900/50 rounded-lg overflow-hidden min-h-[300px] flex items-center justify-center">
                <ImageUploader
                  ref={sceneUploaderRef}
                  id="scene-uploader"
                  onFileSelect={handleSceneImageUpload}
                  imageUrl={displayImageUrl}
                  disabled={isLoading || !!activeSessionId}
                />
                
                {/* Overlay Controls */}
                {(history.length > 0 || sketchedImage) && (
                  <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                     <button onClick={() => handleRotateView('left')} disabled={!currentGeneratedImage} className="p-2 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-full text-white shadow-lg disabled:opacity-50 transition-all"><ArrowLeftIcon /></button>
                     <button onClick={() => handleRotateView('right')} disabled={!currentGeneratedImage} className="p-2 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-full text-white shadow-lg disabled:opacity-50 transition-all"><ArrowRightIcon /></button>
                  </div>
                )}
                
                {/* Status Badges */}
                <div className="absolute top-4 left-4 flex flex-col gap-2">
                    {sketchedImage && (
                    <div className="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-2 shadow-lg animate-fade-in">
                        <span>Sketch Overlay Active</span>
                        <button onClick={handleRemoveSketch} className="hover:text-indigo-200 transition text-lg leading-none">&times;</button>
                    </div>
                    )}
                    {productImage && (
                    <div className="bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-2 shadow-lg animate-fade-in">
                        <span>Product Insert Active</span>
                        <button onClick={handleRemoveProduct} className="hover:text-emerald-200 transition text-lg leading-none">&times;</button>
                    </div>
                    )}
                </div>
              </div>

              {/* Action Bar (Below Image) */}
              {sceneImage && (
                   <div className="flex items-center justify-center gap-4 py-3 bg-gray-50 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700 rounded-b-lg mt-1">
                        <button 
                            onClick={() => setIsSceneryModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition shadow-sm"
                        >
                            <span className="text-indigo-500"><SceneryIcon /></span>
                            Change Scenery
                        </button>
                        
                        {generatedImageUrl && (
                            <button 
                                onClick={handleDownload}
                                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition shadow-sm"
                            >
                                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4 4m4-4v12"></path></svg>
                                Download
                            </button>
                        )}
                   </div>
              )}

              {!sceneImage && !isLoading && (
                <div className="mt-6 text-center pb-6">
                  <p className="text-gray-500 dark:text-gray-400">Or, try an enterprise example:</p>
                  <button onClick={handleInstantStart} className="mt-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                    Load Residential Project Sample
                  </button>
                </div>
              )}
            </div>
              
            {/* Prompt Input Area */}
            {sceneImage && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-1">
                    <div className="flex flex-col md:flex-row items-stretch gap-0">
                        <div className="flex-grow relative">
                            <input
                                type="text"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Instruction (e.g., 'Add a modern pergola', 'Replace grass with stone pavers')"
                                className="w-full h-full px-6 py-4 bg-transparent border-none focus:ring-0 text-gray-800 dark:text-gray-100 placeholder-gray-400 text-lg"
                                disabled={isLoading}
                                onKeyDown={(e) => e.key === 'Enter' && prompt && !isLoading && handleGenerate()}
                            />
                        </div>
                        <button
                            onClick={handleGenerate}
                            disabled={isLoading || !prompt}
                            className="m-1 px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md flex items-center justify-center gap-2"
                        >
                            {isLoading ? 'Processing...' : 'Generate'}
                            {!isLoading && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>}
                        </button>
                    </div>
                </div>
            )}
            
            {/* Overlay Loader */}
            {isLoading && (
              <div className="fixed inset-0 bg-white/90 dark:bg-gray-900/90 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                <Spinner />
                <p className="mt-6 text-xl font-bold text-gray-800 dark:text-gray-200 animate-pulse tracking-wide">{loadingMessages[loadingMessageIndex]}</p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Processing high-resolution architectural data...</p>
              </div>
            )}
            
            {error && (
              <div className="w-full p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg animate-fade-in flex items-start gap-3" role="alert">
                <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <div>
                    <strong className="font-bold block mb-1">System Error</strong>
                    {error}
                </div>
              </div>
            )}
          
            <footer className="w-full flex justify-between items-center pb-8 pt-4 px-2">
              <button onClick={handleNewProject} className="text-xs font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 uppercase tracking-widest transition">Start New Project</button>
              {debugImageUrl && (
                <button onClick={() => setIsDebugModalOpen(true)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">View Debug Data</button>
              )}
            </footer>

          </div>
        </main>
      </div>

      <DebugModal isOpen={isDebugModalOpen} onClose={() => setIsDebugModalOpen(false)} imageUrl={debugImageUrl} prompt={debugPrompt} />
      {displayImageUrl && (
        <DrawingModal isOpen={isDrawingModalOpen} onClose={() => setIsDrawingModalOpen(false)} onSave={handleSaveSketch} backgroundImageUrl={displayImageUrl} />
      )}
      <AddProductModal isOpen={isAddProductModalOpen} onClose={() => setIsAddProductModalOpen(false)} onFileSelect={handleAddCustomProduct} />
      <SceneryModal isOpen={isSceneryModalOpen} onClose={() => setIsSceneryModalOpen(false)} onSelectScenery={handleSceneryChange} />
    </div>
  );
};

export default App;