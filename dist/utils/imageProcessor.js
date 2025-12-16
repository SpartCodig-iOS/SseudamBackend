"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageProcessor = void 0;
const sharp_1 = __importDefault(require("sharp"));
const crypto_1 = require("crypto");
class ImageProcessor {
    /**
     * 이미지를 여러 크기와 포맷으로 최적화 처리
     */
    static async processImageVariants(buffer, originalFilename, userId) {
        if (buffer.length > this.MAX_FILE_SIZE) {
            throw new Error(`파일 크기가 너무 큽니다. 최대 5MB까지 허용됩니다. (현재: ${Math.round(buffer.length / 1024 / 1024)}MB)`);
        }
        const image = (0, sharp_1.default)(buffer);
        const metadata = await image.metadata();
        if (!metadata.width || !metadata.height) {
            throw new Error('유효하지 않은 이미지 파일입니다.');
        }
        const baseFilename = this.generateBaseFilename(userId, originalFilename);
        const variants = [];
        // 썸네일 생성 (150x150, WebP)
        const thumbnail = await this.createThumbnail(image, baseFilename, buffer.length);
        variants.push(thumbnail);
        // 중간 크기 생성 (400px 최대 너비/높이, WebP)
        const medium = await this.createMedium(image, baseFilename, buffer.length);
        variants.push(medium);
        // 원본 크기 최적화 (1200px 최대, WebP/JPEG)
        const original = await this.createOptimizedOriginal(image, baseFilename, buffer.length, metadata);
        variants.push(original);
        return variants;
    }
    /**
     * 썸네일 생성 (150x150)
     */
    static async createThumbnail(image, baseFilename, originalSize) {
        const jpegBuffer = await image
            .clone()
            .resize(this.THUMBNAIL_SIZE, this.THUMBNAIL_SIZE, {
            fit: 'cover',
            position: 'centre'
        })
            .jpeg({ quality: this.QUALITY_JPEG })
            .toBuffer();
        return {
            size: 'thumbnail',
            buffer: jpegBuffer,
            contentType: 'image/jpeg',
            filename: `${baseFilename}_thumb.jpg`,
            width: this.THUMBNAIL_SIZE,
            height: this.THUMBNAIL_SIZE,
            originalSize,
            processedSize: jpegBuffer.length
        };
    }
    /**
     * 중간 크기 생성 (400px 최대)
     */
    static async createMedium(image, baseFilename, originalSize) {
        const mediumBuffer = await image
            .clone()
            .resize(this.MEDIUM_SIZE, this.MEDIUM_SIZE, {
            fit: 'inside',
            withoutEnlargement: true
        })
            .jpeg({ quality: this.QUALITY_JPEG })
            .toBuffer();
        const { width, height } = await (0, sharp_1.default)(mediumBuffer).metadata();
        return {
            size: 'medium',
            buffer: mediumBuffer,
            contentType: 'image/jpeg',
            filename: `${baseFilename}_medium.jpg`,
            width: width || this.MEDIUM_SIZE,
            height: height || this.MEDIUM_SIZE,
            originalSize,
            processedSize: mediumBuffer.length
        };
    }
    /**
     * 원본 크기 최적화 (1200px 최대)
     */
    static async createOptimizedOriginal(image, baseFilename, originalSize, metadata) {
        const needsResize = (metadata.width && metadata.width > this.MAX_ORIGINAL_SIZE) ||
            (metadata.height && metadata.height > this.MAX_ORIGINAL_SIZE);
        let processedImage = image.clone();
        if (needsResize) {
            processedImage = processedImage.resize(this.MAX_ORIGINAL_SIZE, this.MAX_ORIGINAL_SIZE, {
                fit: 'inside',
                withoutEnlargement: true
            });
        }
        // JPEG와 PNG 중 더 효율적인 포맷 선택
        const jpegBuffer = await processedImage.clone().jpeg({ quality: this.QUALITY_JPEG }).toBuffer();
        const pngBuffer = await processedImage.clone().png({ quality: this.QUALITY_PNG }).toBuffer();
        // 더 작은 크기 선택
        const useJpeg = jpegBuffer.length <= pngBuffer.length;
        const finalBuffer = useJpeg ? jpegBuffer : pngBuffer;
        const contentType = useJpeg ? 'image/jpeg' : 'image/png';
        const extension = useJpeg ? 'jpg' : 'png';
        const finalMetadata = await (0, sharp_1.default)(finalBuffer).metadata();
        return {
            size: 'original',
            buffer: finalBuffer,
            contentType,
            filename: `${baseFilename}_original.${extension}`,
            width: finalMetadata.width || metadata.width || 0,
            height: finalMetadata.height || metadata.height || 0,
            originalSize,
            processedSize: finalBuffer.length
        };
    }
    /**
     * 단일 이미지 최적화 (기존 API 호환성용)
     */
    static async optimizeImage(buffer, originalFilename, userId) {
        const variants = await this.processImageVariants(buffer, originalFilename, userId);
        const original = variants.find(v => v.size === 'original');
        if (!original) {
            throw new Error('이미지 처리에 실패했습니다.');
        }
        return {
            buffer: original.buffer,
            contentType: original.contentType,
            filename: original.filename,
            originalSize: original.originalSize,
            processedSize: original.processedSize
        };
    }
    /**
     * 외부 URL에서 이미지 다운로드 및 최적화
     */
    static async processFromUrl(url, userId) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) {
                throw new Error(`이미지 다운로드 실패: ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const filename = this.extractFilenameFromUrl(url) || 'downloaded-image.jpg';
            return this.processImageVariants(buffer, filename, userId);
        }
        catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('이미지 다운로드 시간 초과');
            }
            throw error;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    static generateBaseFilename(userId, originalFilename) {
        const uuid = (0, crypto_1.randomUUID)();
        const timestamp = Date.now();
        const cleanFilename = originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 20);
        return `${userId}/${timestamp}_${uuid}_${cleanFilename}`.replace(/\.[^.]*$/, '');
    }
    static extractFilenameFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const filename = pathname.split('/').pop();
            return filename && filename.includes('.') ? filename : null;
        }
        catch {
            return null;
        }
    }
    /**
     * 이미지 메타데이터 추출
     */
    static async getImageInfo(buffer) {
        const metadata = await (0, sharp_1.default)(buffer).metadata();
        return {
            width: metadata.width || 0,
            height: metadata.height || 0,
            format: metadata.format || 'unknown',
            size: buffer.length
        };
    }
    /**
     * 이미지 포맷 검증
     */
    static isValidImageFormat(buffer) {
        try {
            const image = (0, sharp_1.default)(buffer);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.ImageProcessor = ImageProcessor;
ImageProcessor.THUMBNAIL_SIZE = 150;
ImageProcessor.MEDIUM_SIZE = 400;
ImageProcessor.MAX_ORIGINAL_SIZE = 1200;
ImageProcessor.QUALITY_JPEG = 90;
ImageProcessor.QUALITY_PNG = 85;
ImageProcessor.MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
