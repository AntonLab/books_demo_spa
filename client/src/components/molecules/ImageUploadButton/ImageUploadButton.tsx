import type { FC } from 'react';
import { Button, Upload } from 'antd';
import {
  ACCEPTED_IMAGE_CONTENT_TYPES,
  IMAGE_MAX_BYTES,
  type AcceptedImageContentType,
} from 'shared';

interface ImageUploadButtonProps {
  label: string;
  loading?: boolean;
  // Called only for a file that passes both prechecks. Never fired for a
  // rejected one.
  onFile: (file: File) => void;
  // Called instead of onFile, with a message ready to show as-is, when the
  // picked file fails a precheck.
  onReject: (message: string) => void;
}

const ACCEPT = ACCEPTED_IMAGE_CONTENT_TYPES.join(',');

const isAcceptedType = (type: string): type is AcceptedImageContentType =>
  (ACCEPTED_IMAGE_CONTENT_TYPES as readonly string[]).includes(type);

// Purely presentational (K8/K9): the type and size prechecks so the caller
// fails fast, nothing else. No query or API import — the caller decides what
// an accepted file does.
export const ImageUploadButton: FC<ImageUploadButtonProps> = ({
  label,
  loading = false,
  onFile,
  onReject,
}) => {
  // Always returns false: antd must never start its own upload request, only
  // read the file and hand it (or the rejection) back to the caller.
  const handleBeforeUpload = (file: File): boolean => {
    if (!isAcceptedType(file.type)) {
      onReject('Choose a JPEG, PNG or WebP image.');
    } else if (file.size === 0) {
      onReject('That file is empty.');
    } else if (file.size > IMAGE_MAX_BYTES) {
      onReject('Images must be 2 MiB or smaller.');
    } else {
      onFile(file);
    }
    return false;
  };

  return (
    <Upload
      accept={ACCEPT}
      showUploadList={false}
      beforeUpload={handleBeforeUpload}
    >
      <Button loading={loading}>{label}</Button>
    </Upload>
  );
};
