"use server";

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function getPresignedUrl(filePath: string, contentType: string) {
  try {
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrlBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

    if (!bucketName || !publicUrlBase) {
      throw new Error("Missing R2 environment variables");
    }

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: filePath,
      ContentType: contentType,
    });

    // Generate the presigned URL valid for 60 seconds
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

    // Construct the public URL for the file
    const publicUrl = `${publicUrlBase.replace(/\/$/, "")}/${filePath}`;

    return { presignedUrl, publicUrl };
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    throw new Error("Failed to generate presigned URL");
  }
}

export async function deleteR2File(filePath: string) {
  try {
    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) throw new Error("Missing R2 bucket name");

    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: filePath,
    });
    
    await s3Client.send(command);
  } catch (err) {
    console.error("Failed to delete from R2:", err);
  }
}
