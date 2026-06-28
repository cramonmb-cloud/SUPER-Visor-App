
import { GoogleGenAI } from "@google/genai";

// Fixed: Correct initialization with named parameter and direct process.env.API_KEY usage.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeGuaranteePhoto = async (base64Image: string): Promise<string> => {
  // Fixed: Removed redundant API key check as per guidelines (assume pre-configured).
  try {
    // Remove header if present (e.g., "data:image/jpeg;base64,")
    const cleanBase64 = base64Image.split(',')[1] || base64Image;

    // Fixed: Using gemini-2.5-flash-image for standard image generation/editing tasks.
    const modelName = 'gemini-2.5-flash-image';
    const prompt = "Analiza esta imagen. Es una garantía para un préstamo. Describe brevemente el objeto (marca, tipo, condición aparente) en español. Máximo 20 palabras.";

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg', // Assuming JPEG for simplicity from camera
              data: cleanBase64
            }
          },
          { text: prompt }
        ]
      }
    });

    // Fixed: Extracted text directly from response.text property (not a method).
    return response.text || "No se pudo generar descripción.";
  } catch (error) {
    console.error("Error analyzing image with Gemini:", error);
    return "Error al analizar imagen. Ingrese descripción manual.";
  }
};
