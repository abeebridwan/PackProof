import { parseImageStream, recordsOfKind, decodeMaskToRaster, type ImageSegmentationResult } from '@meta-sam/parser';

// Provider output must pass the official parser. JSON-shaped substitutes are never accepted.
export async function decodeSam(events: AsyncIterable<{ type: string }>, width: number, height: number, inspect?: (result: ImageSegmentationResult) => void) {
  const result = await parseImageStream(events).finalResult;
  inspect?.(result);
  return requireRegion(result, width, height);
}
export function requireRegion(result: ImageSegmentationResult, width: number, height: number) {
  if (result.outcome.status !== 'completed' || result.diagnostics.length) throw new Error('Incomplete or malformed SAM stream');
  const boxes = recordsOfKind(result.records, 'box');
  const masks = recordsOfKind(result.records, 'mask');
  const mask = masks[0];
  const box = boxes.find(b => b.objectId === mask?.objectId);
  if (!mask || !box) throw new Error('Needs evidence: empty SAM region');
  const b = mask.bounds;
  if (![box.left, box.top, box.right, box.bottom].every(Number.isFinite) || box.left < 0 || box.top < 0 || box.right > width || box.bottom > height || box.right <= box.left || box.bottom <= box.top) throw new Error('Invalid SAM box');
  if (![b.left, b.top, b.right, b.bottom].every(Number.isInteger) || b.left < 0 || b.top < 0 || b.right > width || b.bottom > height || b.right <= b.left || b.bottom <= b.top ||
      !Number.isInteger(mask.mask.width) || !Number.isInteger(mask.mask.height) || mask.mask.width < 1 || mask.mask.height < 1 || mask.mask.width * mask.mask.height > 1_048_576) throw new Error('Invalid SAM dimensions');
  const raster = decodeMaskToRaster(mask.mask);
  if (raster.length !== mask.mask.width * mask.mask.height || !raster.some(Boolean)) throw new Error('Needs evidence: empty SAM mask');
  return { result, boxes, mask, box, raster };
}
