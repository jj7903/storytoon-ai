import { GoogleGenAI, Type, Modality } from "@google/genai";

// This function safely gets the API key that Netlify will inject for us.
const getApiKey = (): string => {
  // Netlify Snippet Injection을 통해 window 객체에 저장된 API 키를 가져옵니다.
  const apiKey = (window as any).GEMINI_API_KEY;

  // API 키가 없거나, Netlify가 아직 값을 주입하기 전의 기본 텍스트일 경우 에러를 발생시킵니다.
  if (!apiKey || apiKey === '{{- getenv "API_KEY" -}}') {
    // 사용자에게 API 키 설정이 잘못되었음을 알기 쉽게 alert 창으로 알려줍니다.
    alert("API 키가 설정되지 않았습니다. Netlify의 'Site settings > Build & deploy > Post processing > Snippet injection' 설정을 확인해주세요.");
    throw new Error("API_KEY is not configured correctly on Netlify.");
  }
  return apiKey;
}

// 필요할 때마다 AI 클라이언트를 초기화해서 가져오는 함수입니다.
const getAiClient = () => {
  // getApiKey()를 통해 안전하게 키를 가져와 클라이언트를 생성합니다.
  return new GoogleGenAI({ apiKey: getApiKey() });
}


/**
 * Splits a single story narrative into four distinct parts for a 4-panel comic.
 * @param story The full story to be split.
 * @returns A promise that resolves to an array of four strings, each representing a panel's story.
 */
export const splitStoryIntoPanels = async (story: string): Promise<string[]> => {
    try {
        const ai = getAiClient(); // AI 클라이언트를 호출합니다.
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Analyze the following story and split it into four distinct, chronological parts. Each part should work as a single panel in a 4-panel webtoon. Focus on creating clear, concise descriptions for each scene.

            Story: "${story}"

            Return the four parts as a JSON array of strings.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.STRING,
                        description: "A concise story description for a single comic panel."
                    }
                },
            },
        });
        
        const panels = JSON.parse(response.text);
        
        if (!Array.isArray(panels) || panels.length === 0) {
            throw new Error("AI failed to return panels in the expected format.");
        }
        
        const resultPanels = panels.slice(0, 4);
        while (resultPanels.length < 4) {
            resultPanels.push("...");
        }

        return resultPanels;
    } catch (error) {
        console.error("Error splitting story:", error);
        throw new Error("Failed to split the story into panels. Please try rephrasing your story.");
    }
};


/**
 * Generates a comic panel image by editing a pre-composited character image.
 * @param preCompositedImage The pre-composited image of characters on a white background.
 * @param panelStory The story/prompt for the specific panel.
 * @returns The base64 encoded string of the generated image.
 */
export const generateComicPanel = async (
  preCompositedImage: { data: string, mimeType: string },
  panelStory: string,
): Promise<string> => {
  try {
    const ai = getAiClient(); // AI 클라이언트를 호출합니다.
    const prompt = `You are a webtoon artist. The provided image contains character(s) on a plain background. 
    Your task is to draw a complete scene around them based on the scene description below.
    - Redraw the entire image in a consistent, clean webtoon art style.
    - The characters' appearance and poses should be preserved but integrated naturally into the new scene.
    - Create a detailed background and environment that matches the scene description.
    
    Scene Description: "${panelStory}"
    `;
    
    const imagePart = {
        inlineData: {
            data: preCompositedImage.data,
            mimeType: preCompositedImage.mimeType,
        },
    };

    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: {
        parts: [imagePart, textPart],
      },
      config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            return part.inlineData.data;
        }
    }
    
    throw new Error("Image generation returned no image data.");

  } catch (error) {
    console.error("Error generating comic panel:", error);
    throw new Error("Failed to generate the comic panel. The model may have safety restrictions on the prompt or image.");
  }
};
