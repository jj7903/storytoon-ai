import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

if (!API_KEY) {
  throw new Error('Gemini API key is not configured');
}

const genAI = new GoogleGenerativeAI(API_KEY);

export class GeminiService {
  private model = genAI.getGenerativeModel({ model: 'gemini-pro' });

  async generateStoryFrames(story: string): Promise<string[]> {
    const prompt = `다음 스토리를 4컷 만화로 나누어 주세요. 각 컷은 명확한 장면과 행동을 포함해야 합니다:

스토리: ${story}

4개의 프레임으로 나누어서, 각 프레임마다 다음 형식으로 응답해 주세요:
프레임 1: [장면 설명]
프레임 2: [장면 설명]
프레임 3: [장면 설명]
프레임 4: [장면 설명]`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // 프레임별로 분할
      const frames = text.split(/프레임 \d+:/)
        .filter(frame => frame.trim() !== '')
        .map(frame => frame.trim());
      
      return frames.slice(0, 4); // 최대 4개 프레임만 반환
    } catch (error) {
      console.error('Error generating story frames:', error);
      throw new Error('Failed to generate story frames');
    }
  }

  async generateImagePrompt(frameDescription: string): Promise<string> {
    const prompt = `다음 장면 설명을 이미지 생성 AI를 위한 영어 프롬프트로 변환해 주세요. 4컷 만화 스타일로 만들어 주세요:

장면: ${frameDescription}

요구사항:
- 만화/카툰 스타일
- 명확하고 간단한 구도
- 4컷 만화에 적합한 프레이밍
- 영어로 응답`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      console.error('Error generating image prompt:', error);
      throw new Error('Failed to generate image prompt');
    }
  }
}
