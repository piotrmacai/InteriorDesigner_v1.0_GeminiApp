/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';

interface SceneryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectScenery: (prompt: string) => void;
}

const presets = [
    { name: 'Golden Hour', prompt: 'Golden hour lighting, warm sunset, long soft shadows, cozy atmosphere', color: 'bg-orange-100' },
    { name: 'Modern Night', prompt: 'Night time, exterior lights on, cinematic dark blue sky, warm interior glow', color: 'bg-indigo-900' },
    { name: 'Sunny Day', prompt: 'Bright clear blue sky, noon lighting, vibrant colors, sharp shadows', color: 'bg-blue-100' },
    { name: 'Overcast / Moody', prompt: 'Overcast cloudy sky, soft diffused lighting, brutalist moody atmosphere, neutral tones', color: 'bg-gray-300' },
    { name: 'Snowy Winter', prompt: 'Winter scene, ground covered in fresh white snow, soft winter light, frost', color: 'bg-slate-100' },
    { name: 'Autumn Foliage', prompt: 'Autumn season, orange and red leaves on trees, crisp fall air atmosphere', color: 'bg-orange-50' },
    { name: 'Tropical', prompt: 'Tropical environment, palm trees in background, warm humid atmosphere, bright sun', color: 'bg-teal-100' },
    { name: 'Forest Edge', prompt: 'Dense green forest background, nature surrounding, peaceful seclusion', color: 'bg-green-100' },
];

const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const SceneryModal: React.FC<SceneryModalProps> = ({ isOpen, onClose, onSelectScenery }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl p-6 relative transform transition-all"
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
        >
          <CloseIcon />
        </button>
        
        <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Change Scenery</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">Select a new environment for your project. The building structure will remain unchanged.</p>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {presets.map((preset) => (
                <button
                    key={preset.name}
                    onClick={() => onSelectScenery(preset.prompt)}
                    className={`
                        flex flex-col items-center justify-center p-4 rounded-xl border-2 border-transparent
                        hover:border-indigo-500 hover:shadow-md transition-all group
                        ${preset.color} dark:bg-opacity-20
                    `}
                >
                    <div className={`w-12 h-12 rounded-full mb-3 shadow-inner ${preset.color} border border-black/10 flex items-center justify-center`}>
                        {/* Simple decorative circle inside */}
                        <div className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-sm"></div>
                    </div>
                    <span className="font-semibold text-sm text-gray-800 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 text-center">
                        {preset.name}
                    </span>
                </button>
            ))}
        </div>
      </div>
    </div>
  );
};

export default SceneryModal;