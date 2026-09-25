import { useState } from 'react';
import type { FC } from 'react';
import { Alert, Button, Flex, Input } from 'antd';
import spacing from '@/theme/spacing.module.css';

interface UnsavedTextNoticeProps {
  title?: string;
  text: string;
  onDiscard: () => void;
}

// Unsaved text whose place is gone (a deleted Chapter, Book or Comment, or a
// Book this Account no longer co-authors). Only Discard removes it, never Copy,
// so a copy that fails loses nothing.
export const UnsavedTextNotice: FC<UnsavedTextNoticeProps> = ({
  title,
  text,
  onDiscard,
}) => {
  const [copied, setCopied] = useState(false);
  const content = title ? `${title}\n\n${text}` : text;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
    } catch {
      // No clipboard (an insecure origin) or permission refused: the text is
      // still on screen to select by hand.
    }
  };

  return (
    <Alert
      type="warning"
      className={spacing.gapBelow}
      title="Where this text was typed is gone. Copy it before you discard it."
      description={
        <Input.TextArea
          readOnly
          rows={6}
          value={content}
          aria-label="Unsaved text"
        />
      }
      action={
        <Flex vertical gap="small">
          <Button size="small" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button size="small" danger onClick={onDiscard}>
            Discard
          </Button>
        </Flex>
      }
    />
  );
};
