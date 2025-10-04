import multer from 'multer';
import { uploadToCloudinary } from '../utils/cloudinary';
import { v4 as uuidv4 } from 'uuid';


// Memory storage untuk Cloudinary
const storage = multer.memoryStorage();

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

export const uploadPaymentProof = upload.single('paymentProof');
export const uploadEventImage = upload.single('eventImage');
export const uploadProfilePicture = upload.single('profilePicture');