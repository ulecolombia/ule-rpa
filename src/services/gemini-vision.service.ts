import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import { logger } from '../utils/logger';

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });

export interface VisionResult {
  hasError: boolean;
  errorMessage: string | null;
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  currentStep?: string;
}

export async function analyzeScreenshot(
  screenshotPath: string,
  question: string
): Promise<VisionResult> {
  try {
    const imageData = fs.readFileSync(screenshotPath);
    const base64Image = imageData.toString('base64');

    const prompt = `
Eres un asistente que analiza screenshots de formularios web de seguridad social colombiana (SOI, Mi Planilla, Aportes en Línea).
Responde ÚNICAMENTE con JSON válido, sin markdown, sin texto adicional.

Pregunta: ${question}

Formato de respuesta:
{
  "hasError": boolean,
  "errorMessage": "texto del error visible en pantalla o null",
  "answer": "descripción corta de lo que ves",
  "confidence": "high|medium|low",
  "currentStep": "nombre del paso visible si aplica"
}`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: 'image/png', data: base64Image } }
    ]);

    const text = result.response.text().trim();
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);

  } catch (err) {
    logger.warn(`[GeminiVision] Error analizando screenshot: ${err}`);
    return {
      hasError: false,
      errorMessage: null,
      answer: 'No se pudo analizar',
      confidence: 'low'
    };
  }
}
