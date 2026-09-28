import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { makeImage } from '../test/helpers.js';
import { AppError } from './app-error.js';
import { processProfileImage } from './image.js';

async function expectInvalid(input: Buffer, message: RegExp) {
  const error = await processProfileImage(input).catch((err: unknown) => err);
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe('INVALID_IMAGE');
  expect((error as AppError).message).toMatch(message);
}

describe('processProfileImage', () => {
  it('strips ALL metadata, including GPS location', async () => {
    const input = await makeImage({ width: 800, height: 1000, gps: true });
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const output = await processProfileImage(input);
    const metadata = await sharp(output.buffer).metadata();

    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(output.buffer.includes(Buffer.from('test-owner'))).toBe(false);
    expect(output.format).toBe('jpeg');
  });

  it.each(['jpeg', 'png', 'webp'] as const)(
    'accepts %s and re-encodes it as JPEG',
    async (format) => {
      const output = await processProfileImage(
        await makeImage({ width: 500, height: 500, format }),
      );
      expect((await sharp(output.buffer).metadata()).format).toBe('jpeg');
    },
  );

  it('downsizes large images to at most 1600 px on the long edge', async () => {
    const output = await processProfileImage(await makeImage({ width: 3200, height: 2400 }));
    expect(output.width).toBe(1600);
    expect(output.height).toBe(1200);
  });

  it('rejects images smaller than 400×400', async () => {
    await expectInvalid(await makeImage({ width: 399, height: 800 }), /at least 400×400/);
  });

  it('rejects other image formats such as GIF', async () => {
    await expectInvalid(
      await makeImage({ width: 500, height: 500, format: 'gif' }),
      /JPEG, PNG or WebP/,
    );
  });

  it('rejects files that are not images, whatever their name or type claims', async () => {
    await expectInvalid(Buffer.from('<?php echo "hello"; ?>'), /not a valid image/);
    await expectInvalid(Buffer.from('%PDF-1.7 fake pdf'), /not a valid image/);
  });
});
