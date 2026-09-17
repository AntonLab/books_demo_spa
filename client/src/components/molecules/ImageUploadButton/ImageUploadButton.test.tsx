import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageUploadButton } from './ImageUploadButton';
import { renderWithProviders } from '@/test/renderWithProviders';
import { IMAGE_MAX_BYTES } from '@/types/api';

describe('ImageUploadButton', () => {
  it('renders a single button carrying the given label', () => {
    renderWithProviders(
      <ImageUploadButton
        label="Upload cover"
        onFile={jest.fn()}
        onReject={jest.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Upload cover' })
    ).toBeInTheDocument();
  });

  it('calls onFile with an accepted, small enough file', async () => {
    const onFile = jest.fn();
    const onReject = jest.fn();
    renderWithProviders(
      <ImageUploadButton
        label="Upload cover"
        onFile={onFile}
        onReject={onReject}
      />
    );
    const file = new File([new Uint8Array([1, 2, 3])], 'cover.png', {
      type: 'image/png',
    });

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await userEvent.upload(input, file);

    expect(onFile).toHaveBeenCalledWith(file);
    expect(onReject).not.toHaveBeenCalled();
  });

  it('rejects a file of an unaccepted type without calling onFile', async () => {
    // user-event v14 applies the input's `accept` attribute by default, which
    // would silently drop a .gif before it ever reached the component's own
    // precheck.
    const user = userEvent.setup({ applyAccept: false });
    const onFile = jest.fn();
    const onReject = jest.fn();
    renderWithProviders(
      <ImageUploadButton
        label="Upload cover"
        onFile={onFile}
        onReject={onReject}
      />
    );
    const file = new File([new Uint8Array([1])], 'cover.gif', {
      type: 'image/gif',
    });

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, file);

    expect(onReject).toHaveBeenCalledWith('Choose a JPEG, PNG or WebP image.');
    expect(onFile).not.toHaveBeenCalled();
  });

  it('rejects a file over the byte ceiling without calling onFile', async () => {
    const onFile = jest.fn();
    const onReject = jest.fn();
    renderWithProviders(
      <ImageUploadButton
        label="Upload cover"
        onFile={onFile}
        onReject={onReject}
      />
    );
    const oversized = new Uint8Array(IMAGE_MAX_BYTES + 1);
    const file = new File([oversized], 'cover.png', { type: 'image/png' });

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await userEvent.upload(input, file);

    expect(onReject).toHaveBeenCalledWith('Images must be 2 MiB or smaller.');
    expect(onFile).not.toHaveBeenCalled();
  });
});
