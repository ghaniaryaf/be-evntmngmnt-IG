import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import { Readable } from 'stream';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadToCloudinary = (file: Express.Multer.File): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!file.buffer) {
      reject(new Error('File buffer is required'));
      return;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder: 'event-management/payments',
      },
      (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
        if (error) {
          reject(new Error(error.message));
        } else if (result && result.secure_url) {
          resolve(result.secure_url);
        } else {
          reject(new Error('Upload failed'));
        }
      }
    );

    // Convert buffer to stream
    const stream = Readable.from(file.buffer);
    stream.pipe(uploadStream);
  });
};

export const deleteFromCloudinary = async (url: string): Promise<void> => {
  try {
    const publicId = extractPublicId(url);
    if (publicId) {
      await cloudinary.uploader.destroy(publicId);
    }
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
  }
};

const extractPublicId = (url: string): string | null => {
  try {
    const urlParts = url.split('/');
    const filename = urlParts[urlParts.length - 1];
    return filename.split('.')[0]; // Remove file extension
  } catch {
    return null;
  }
};

export default cloudinary;