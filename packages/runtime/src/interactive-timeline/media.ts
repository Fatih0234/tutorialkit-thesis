export type RecordingMediaKind = 'audio' | 'webcam';

export interface RecordingMediaAssetMetadata {
  id: string;
  recordingId: string;
  kind: RecordingMediaKind;
  mimeType: string;
  durationMs: number;
  createdAt: string;
}

export interface RecordingMediaAsset extends RecordingMediaAssetMetadata {
  blob?: Blob;
}

export function getRecordingMediaAssetMetadata(asset: RecordingMediaAsset): RecordingMediaAssetMetadata {
  return {
    id: asset.id,
    recordingId: asset.recordingId,
    kind: asset.kind,
    mimeType: asset.mimeType,
    durationMs: asset.durationMs,
    createdAt: asset.createdAt,
  };
}
