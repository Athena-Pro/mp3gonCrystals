import { GoogleGenAI, Type } from "@google/genai";
import { TransformationType } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  // This will prevent the app from breaking if the API key is not set.
  // The UI will handle the error gracefully.
  console.warn("Gemini API key not found. AI features will be disabled.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY! });

const nameGenerationSchema = {
  type: Type.OBJECT,
  properties: {
    names: {
      type: Type.ARRAY,
      description: 'A list of 5 creative, evocative, and interesting names for the sound.',
      items: {
        type: Type.STRING
      }
    }
  },
  required: ['names']
};


export async function generateSoundName(
  sourceName: string,
  targetName: string,
  transformation: TransformationType,
  morphA?: TransformationType,
  morphB?: TransformationType
): Promise<string[]> {
  if (!API_KEY) {
    throw new Error("API key is not configured.");
  }
  
  let transformationDescription = `The transformation technique used was: "${transformation}".`;
  if (transformation === TransformationType.TRANSFORMATION_MORPH) {
    transformationDescription += ` This was a morph between two techniques: "${morphA}" (A) and "${morphB}" (B).`;
  }
  
  const prompt = `
    I have created a new sound using a digital audio technique. I need some creative names for it.
    
    The process involved two sounds:
    1.  Source Sound (whose characteristics were taken): "${sourceName}"
    2.  Target Sound (the sound that was modified): "${targetName}"
    
    ${transformationDescription}

    Here are descriptions of the techniques:
    - "${TransformationType.AMPLITUDE}": The rhythm and volume shape of the source was applied to the target.
    - "${TransformationType.SPECTRAL}": The tonal color and frequency character of the source was imprinted onto the target.
    - "${TransformationType.RHYTHMIC}": The percussive hits of the source were used to trigger the target sound.
    - "${TransformationType.CONVOLUTION}": The resonance and acoustic space of the source was applied to the target.
    - "${TransformationType.TIME_WARP}": The rhythmic timing of the source was applied to the target, stretching and shrinking it to match the source's groove.
    - "${TransformationType.SURFACE_TRANSLATE}": The texture of the target sound was re-sequenced according to the waveform shape of the source.
    - "${TransformationType.FOURIER_MASKING}": The raw frequency-by-frequency power of the source was applied to the target's sound structure, creating a direct spectral merge.
    - "${TransformationType.HARMONIC_IMPRINT}": The distinct musical notes and overtones from the source were found and used to create resonant echoes in the target.
    - "${TransformationType.INTERFERENCE_ECHOES}": Rhythmic events in the source audio were used to trigger cascading, feedback-driven echoes of the target audio, creating a complex, interactive delay effect.
    - "${TransformationType.FORMANT_SHIFTING}": The key resonant frequencies that define the 'vowel' character of the source sound were identified and used to create a set of resonant filters that re-shaped the target sound, giving it the vocal quality of the source.
    - "${TransformationType.DYNAMIC_RING_MOD}": The amplitude of the source sound was used to dynamically control the frequency of a sine wave oscillator, which was then multiplied with the target sound to create shifting, metallic, and bell-like textures.
    - "${TransformationType.TRANSFORMATION_MORPH}": A smooth blend was created between the results of two different transformation techniques (A and B).

    Based on this information, generate a list of 5 creative, evocative, and interesting names for the resulting sound. The names should be short (2-4 words). Avoid generic or technical terms. Think artistically.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: nameGenerationSchema,
        temperature: 0.8,
      },
    });

    const jsonText = response.text.trim();
    const result = JSON.parse(jsonText);

    if (result && Array.isArray(result.names)) {
      return result.names;
    } else {
      console.error("Unexpected JSON structure from Gemini:", result);
      throw new Error("AI returned an unexpected data format.");
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    // Check for specific API-related errors if possible, otherwise rethrow a generic error
    if (error instanceof Error && error.message.includes("API key not valid")) {
       throw new Error("The configured Gemini API key is not valid.");
    }
    throw new Error("Failed to communicate with the AI name generator.");
  }
}