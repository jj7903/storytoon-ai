
import React, { useState, useCallback, useRef } from 'react';
import { splitStoryIntoPanels, generateComicPanel } from './services/geminiService';
import { AspectRatio, CharacterData, PanelData } from './types';

const initialPanels: PanelData[] = Array(4).fill(null).map(() => ({
  story: '',
  image: null,
  characters: [],
  isRegenerating: false,
}));

const App: React.FC = () => {
  const [panels, setPanels] = useState<PanelData[]>(initialPanels);
  const [story, setStory] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [generationAttempted, setGenerationAttempted] = useState<boolean>(false);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, panelIndex: number) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const newCharacters: CharacterData[] = files.map(file => ({
        file,
        preview: URL.createObjectURL(file),
      }));
      setPanels(prev => prev.map((panel, idx) => {
        if (idx === panelIndex) {
          const updatedCharacters = [...panel.characters, ...newCharacters].slice(0, 2); // Limit to 2 characters
          return { ...panel, characters: updatedCharacters };
        }
        return panel;
      }));
    }
  };
  
  const removeCharacter = (panelIndex: number, charIndex: number) => {
    setPanels(prev => prev.map((panel, idx) => {
      if (idx === panelIndex) {
        return { ...panel, characters: panel.characters.filter((_, i) => i !== charIndex) };
      }
      return panel;
    }));
  };

  const handleFileButtonClick = (panelIndex: number) => {
    fileInputRefs.current[panelIndex]?.click();
  };

  const preprocessImages = useCallback(async (characters: CharacterData[], currentAspectRatio: AspectRatio): Promise<{ data: string, mimeType: string }> => {
    const imageElements = await Promise.all(
      characters.map(char => new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = char.preview;
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
      }))
    );

    const canvas = document.createElement('canvas');
    const [width, height] = currentAspectRatio === '16:9' ? [1920, 1080] : [1080, 1920];
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    const totalCharacters = imageElements.length;
    imageElements.forEach((img, index) => {
      const scale = Math.min((width / totalCharacters) * 0.8 / img.width, (height * 0.8) / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      const sectionWidth = width / totalCharacters;
      const px = (sectionWidth * index) + (sectionWidth - iw) / 2;
      const py = (height - ih) / 2;
      ctx.drawImage(img, px, py, iw, ih);
    });
    
    const mimeType = 'image/png';
    const base64String = canvas.toDataURL(mimeType).split(',')[1];
    return { data: base64String, mimeType };
  }, []);

  const runGeneration = useCallback(async (panelIndex: number, panel: PanelData) => {
    setPanels(prev => prev.map((p, i) => i === panelIndex ? { ...p, isRegenerating: true, image: null } : p));
    try {
      const preCompositedImage = await preprocessImages(panel.characters, aspectRatio);
      const generatedImage = await generateComicPanel(preCompositedImage, panel.story);
      setPanels(prev => prev.map((p, i) => i === panelIndex ? { ...p, image: `data:image/png;base64,${generatedImage}`, isRegenerating: false } : p));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Panel ${panelIndex + 1} Error: ${errorMessage}`);
      setPanels(prev => prev.map((p, i) => i === panelIndex ? { ...p, isRegenerating: false } : p));
      throw err; // re-throw to stop sequential generation
    }
  }, [aspectRatio, preprocessImages]);


  const handleGenerate = async () => {
    if (!story.trim()) {
      setError('Please provide a story.');
      return;
    }
    setLoading(true);
    setError(null);
    setGenerationAttempted(true);

    try {
      const panelStories = await splitStoryIntoPanels(story);
      const updatedPanels = panels.map((p, i) => ({ ...p, story: panelStories[i] || '' }));
      setPanels(updatedPanels);

      for (let i = 0; i < updatedPanels.length; i++) {
        await runGeneration(i, updatedPanels[i]);
      }
    } catch (err) {
       // Error is already set in runGeneration, just log it
       console.error("Stopping generation due to an error.", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegeneratePanel = async (panelIndex: number) => {
    const panelToRegen = panels[panelIndex];
    if (!panelToRegen || !panelToRegen.story) {
      setError(`Please provide a story for Panel ${panelIndex + 1} before regenerating.`);
      return;
    }
    setError(null);
    await runGeneration(panelIndex, panelToRegen);
  };
  
  const handleDownload = (imageUrl: string, index: number) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `storytoon-panel-${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  return (
    <div className="bg-gray-900 text-gray-100 min-h-screen font-sans flex flex-col p-4 md:p-8">
      <header className="text-center mb-6">
        <h1 className="text-4xl md:text-5xl font-bold text-cyan-400">Storytoon AI</h1>
        <p className="text-gray-400 mt-2">Bring your stories to life, one panel at a time.</p>
      </header>
      
      {/* Comic Display Grid */}
      <main className="flex-grow">
        <div className={`grid gap-4 ${aspectRatio === '9:16' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 md:grid-cols-2'}`}>
          {panels.map((panel, index) => (
            <div key={index} className="bg-gray-800 rounded-lg p-3 flex flex-col gap-3">
              <div className={`relative w-full bg-gray-900 rounded ${aspectRatio === '16:9' ? 'aspect-[16/9]' : 'aspect-[9/16]'}`}>
                { (loading || panel.isRegenerating) &&
                  <div className="absolute inset-0 flex justify-center items-center bg-black bg-opacity-50 rounded">
                    <div className="w-12 h-12 border-4 border-gray-500 border-t-cyan-400 rounded-full animate-spin"></div>
                  </div>
                }
                { panel.image && <img src={panel.image} alt={`Panel ${index + 1}`} className="w-full h-full object-contain rounded" /> }
              </div>
              { generationAttempted && (
                <>
                  <textarea
                    value={panel.story}
                    onChange={(e) => {
                      const newStory = e.target.value;
                      setPanels(p => p.map((pan, i) => i === index ? { ...pan, story: newStory } : pan));
                    }}
                    placeholder={`Story for panel ${index + 1}...`}
                    className="w-full bg-gray-700 text-gray-200 rounded p-2 text-sm border border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleRegeneratePanel(index)} disabled={loading || panel.isRegenerating} className="flex-1 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded text-sm transition-colors">
                      Regenerate
                    </button>
                    {panel.image && <button onClick={() => handleDownload(panel.image!, index)} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded text-sm transition-colors">Download</button>}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </main>

      {/* Controls Panel */}
      <footer className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 mt-8 sticky bottom-4 border border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          <div className="md:col-span-1">
            <h3 className="font-bold mb-2 text-lg">Your Story</h3>
            <textarea
              value={story}
              onChange={e => setStory(e.target.value)}
              placeholder="e.g., A robot chef discovers a recipe for anti-gravity pancakes, causing chaos in the kitchen."
              className="w-full bg-gray-700 text-gray-200 rounded p-2 border border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              rows={5}
            />
          </div>
          <div className="md:col-span-2">
            <h3 className="font-bold mb-2 text-lg">Characters per Panel</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {panels.map((panel, index) => (
                <div key={index} className="bg-gray-700 p-2 rounded">
                  <span className="font-semibold text-sm block mb-2">Panel {index + 1}</span>
                  <div className="flex items-center gap-2">
                    {panel.characters.map((char, charIndex) => (
                      <div key={charIndex} className="relative">
                        <img src={char.preview} alt={`Char ${charIndex}`} className="w-12 h-12 object-cover rounded"/>
                        <button onClick={() => removeCharacter(index, charIndex)} className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">&times;</button>
                      </div>
                    ))}
                    {panel.characters.length < 2 && (
                      <>
                        <input
                          type="file"
                          // FIX: The ref callback was implicitly returning the assigned element, causing a type error.
                          // Ref callbacks must not return a value, so wrapping the assignment in curly braces `{}` ensures a `void` return.
                          ref={el => { fileInputRefs.current[index] = el; }}
                          onChange={e => handleFileChange(e, index)}
                          accept="image/png, image/jpeg"
                          className="hidden"
                        />
                        <button onClick={() => handleFileButtonClick(index)} className="w-12 h-12 bg-gray-600 hover:bg-gray-500 rounded flex items-center justify-center text-2xl font-light">+</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-gray-700 mt-4 pt-4 flex flex-col md:flex-row items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="aspect-ratio" className="font-bold">Aspect Ratio:</label>
            <select id="aspect-ratio" value={aspectRatio} onChange={e => setAspectRatio(e.target.value as AspectRatio)} className="bg-gray-700 text-gray-200 rounded p-2 border border-gray-600">
              <option value="16:9">16:9 Landscape</option>
              <option value="9:16">9:16 Portrait</option>
            </select>
          </div>
          <button onClick={handleGenerate} disabled={loading} className="w-full md:w-auto bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 text-white font-bold py-3 px-8 rounded text-lg transition-colors md:ml-auto">
            {loading ? 'Creating...' : 'Create Storytoon'}
          </button>
        </div>
        {error && <p className="text-red-400 text-center mt-4">{error}</p>}
      </footer>
    </div>
  );
};

export default App;
