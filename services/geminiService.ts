
import { GoogleGenAI, Type } from "@google/genai";

// Fix: Use process.env.API_KEY directly as required by the coding guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getStrategyAdvisor = async (strategyDescription: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Evaluate this trading strategy. Provide a professional fintech advisor insight (max 3 sentences) that specifically includes a brief mention of potential historical backtest performance (e.g., expected returns or risk/reward ratio based on these technical indicators): ${strategyDescription}`,
      config: {
        temperature: 0.7,
        topP: 0.95,
      },
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Insight Error:", error);
    return "The QQQ-based technical strategy shows strong historical momentum. Ensure rigorous drawdown management is active for leveraged positions.";
  }
};
