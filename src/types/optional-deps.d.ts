/**
 * Declaraciones de tipos para dependencias opcionales
 * Estas dependencias se instalan solo cuando se necesitan
 */

// @vercel/blob - Para Vercel Blob Storage
declare module '@vercel/blob' {
  interface PutOptions {
    access?: 'public' | 'private';
    addRandomSuffix?: boolean;
    contentType?: string;
  }

  interface PutBlobResult {
    url: string;
    downloadUrl: string;
    pathname: string;
    contentType: string;
    contentDisposition: string;
  }

  export function put(
    pathname: string,
    body: Buffer | Blob | string,
    options?: PutOptions
  ): Promise<PutBlobResult>;
}

// @aws-sdk/client-s3 - Para AWS S3
declare module '@aws-sdk/client-s3' {
  interface S3ClientConfig {
    region?: string;
    credentials?: {
      accessKeyId: string;
      secretAccessKey: string;
    };
  }

  interface PutObjectCommandInput {
    Bucket: string;
    Key: string;
    Body: Buffer | string;
    ContentType?: string;
    Metadata?: Record<string, string>;
  }

  export class S3Client {
    constructor(config: S3ClientConfig);
    send(command: PutObjectCommand): Promise<void>;
  }

  export class PutObjectCommand {
    constructor(input: PutObjectCommandInput);
  }
}
