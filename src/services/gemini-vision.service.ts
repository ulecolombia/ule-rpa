import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import { logger } from '../utils/logger';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let model: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;

if (GEMINI_API_KEY) {
  const genai = new GoogleGenerativeAI(GEMINI_API_KEY);
  model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });
}

export interface VisionResult {
  hasError: boolean;
  errorMessage: string | null;
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  currentStep?: string;
}

/**
 * Analyze a screenshot using Gemini Vision.
 *
 * SECURITY NOTES:
 * - The prompt explicitly instructs Gemini NOT to extract or return PII
 *   (cedulas, passwords, account numbers, personal names).
 * - Only structural/state analysis is requested (button states, error messages, step identification).
 * - Each call is logged with its purpose for audit trail.
 */
export async function analyzeScreenshot(
  screenshotPath: string,
  question: string
): Promise<VisionResult> {
  if (!model) {
    return {
      hasError: false,
      errorMessage: null,
      answer: 'Gemini Vision not configured (no GEMINI_API_KEY)',
      confidence: 'low',
    };
  }

  const purpose = question.substring(0, 80);
  logger.info('[GeminiVision] Analyzing screenshot', {
    purpose,
    file: screenshotPath.split('/').pop(),
  });

  try {
    const imageData = fs.readFileSync(screenshotPath);
    const base64Image = imageData.toString('base64');

    const prompt = `
Eres un asistente que analiza screenshots de formularios web de seguridad social colombiana (SOI, Mi Planilla, Aportes en Línea).

REGLAS DE SEGURIDAD (OBLIGATORIAS):
- NUNCA incluyas en tu respuesta datos personales: cédulas, NIT, nombres completos, emails, números de cuenta, passwords.
- Si ves datos personales en la pantalla, ignóralos. Solo reporta el ESTADO del formulario.
- Tu análisis debe ser ESTRUCTURAL: qué paso está visible, si hay errores, si los botones están habilitados.

Pregunta: ${question}

Responde ÚNICAMENTE con JSON válido, sin markdown, sin texto adicional.
Formato:
{
  "hasError": boolean,
  "errorMessage": "texto del error visible en pantalla o null (sin incluir datos personales)",
  "answer": "descripción corta del estado estructural de la página",
  "confidence": "high|medium|low",
  "currentStep": "nombre del paso visible si aplica"
}`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: 'image/png', data: base64Image } },
    ]);

    const text = result.response.text().trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean) as VisionResult;

    logger.info('[GeminiVision] Analysis complete', {
      purpose,
      hasError: parsed.hasError,
      confidence: parsed.confidence,
      currentStep: parsed.currentStep,
    });

    return parsed;
  } catch (err) {
    logger.warn('[GeminiVision] Error analyzing screenshot', {
      purpose,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      hasError: false,
      errorMessage: null,
      answer: 'No se pudo analizar',
      confidence: 'low',
    };
  }
}
