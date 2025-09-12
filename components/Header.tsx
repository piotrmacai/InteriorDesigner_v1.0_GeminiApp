/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="w-full text-center">
      <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900">
        AI Room Designer
      </h1>
      <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
        Upload a photo of your space, describe your desired style, and let Gemini redesign it for you in seconds.
      </p>
    </header>
  );
};

export default Header;