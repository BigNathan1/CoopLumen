import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateCommunityForm } from '../CreateCommunityForm';
import { api, ApiError } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: { post: jest.fn() },
}));

const mockPost = api.post as jest.Mock;

beforeEach(() => {
  mockPost.mockReset();
});

const VALID_KEY = `G${'A'.repeat(55)}`;
const SECOND_KEY = `G${'B'.repeat(55)}`;

function fillValidForm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  return (async () => {
    await user.type(screen.getByLabelText(/community name/i), 'EcoDAO');
    await user.type(screen.getByLabelText(/description/i), 'A community for renewable energy');
    await user.type(screen.getByLabelText(/issuer public key/i), VALID_KEY);
    await user.type(screen.getByLabelText(/asset code/i), 'ECO');
    await user.type(screen.getByLabelText(/asset issuer/i), SECOND_KEY);
  })();
}

describe('CreateCommunityForm', () => {
  it('renders accessible fields and submits parsed values', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue({ id: 'community-1' });

    render(<CreateCommunityForm onSubmit={onSubmit} />);
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create community' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'EcoDAO',
        description: 'A community for renewable energy',
        issuerPublicKey: VALID_KEY,
        assetCode: 'ECO',
        assetIssuer: SECOND_KEY,
      })
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Community created successfully.');
  });

  it('keeps a connected wallet issuer locked to the authenticated address', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue({ id: 'community-wallet' });

    render(
      <CreateCommunityForm
        walletAddress={VALID_KEY}
        defaultValues={{ issuerPublicKey: SECOND_KEY }}
        onSubmit={onSubmit}
      />
    );

    const issuer = screen.getByLabelText(/issuer public key/i);
    expect(issuer).toHaveValue(VALID_KEY);
    expect(issuer).toHaveAttribute('readonly');
    await user.type(screen.getByLabelText(/community name/i), 'EcoDAO');
    await user.type(screen.getByLabelText(/asset code/i), 'ECO');
    await user.type(screen.getByLabelText(/asset issuer/i), SECOND_KEY);
    await user.click(screen.getByRole('button', { name: 'Create community' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].issuerPublicKey).toBe(VALID_KEY);
  });

  it('clears the issuer field when the connected wallet is removed', () => {
    const { rerender } = render(
      <CreateCommunityForm walletAddress={VALID_KEY} onSubmit={jest.fn()} />
    );
    expect(screen.getByLabelText(/issuer public key/i)).toHaveValue(VALID_KEY);

    rerender(<CreateCommunityForm walletAddress={null} onSubmit={jest.fn()} />);
    expect(screen.getByLabelText(/issuer public key/i)).toHaveValue('');
  });

  it('rejects a malformed Stellar public key before calling the submit handler', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    render(<CreateCommunityForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/community name/i), 'EcoDAO');
    await user.type(screen.getByLabelText(/issuer public key/i), 'not-a-stellar-key');
    await user.type(screen.getByLabelText(/asset code/i), 'ECO');
    await user.type(screen.getByLabelText(/asset issuer/i), SECOND_KEY);
    await user.click(screen.getByRole('button', { name: 'Create community' }));

    expect(await screen.findByText(/enter a valid stellar public key/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/issuer public key/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('omits an empty optional description from the submitted payload', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue({ id: 'community-2' });

    render(<CreateCommunityForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/community name/i), 'EcoDAO');
    await user.type(screen.getByLabelText(/issuer public key/i), VALID_KEY);
    await user.type(screen.getByLabelText(/asset code/i), 'ECO');
    await user.type(screen.getByLabelText(/asset issuer/i), SECOND_KEY);
    await user.click(screen.getByRole('button', { name: 'Create community' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'EcoDAO',
        issuerPublicKey: VALID_KEY,
        assetCode: 'ECO',
        assetIssuer: SECOND_KEY,
      })
    );
  });

  it('surfaces a rejected API message as a form-level error', async () => {
    const user = userEvent.setup();
    const onSubmit = jest
      .fn()
      .mockRejectedValue(new Error('A community with this name already exists.'));

    render(<CreateCommunityForm onSubmit={onSubmit} />);
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create community' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A community with this name already exists.'
    );
  });

  it('shows required-field errors and does not submit an empty form', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    render(<CreateCommunityForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Create community' }));

    expect(await screen.findByText(/name must be at least 2 characters/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/community name/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/asset code/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/asset issuer/i)).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('rejects an asset code with invalid characters', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    render(<CreateCommunityForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/community name/i), 'EcoDAO');
    await user.type(screen.getByLabelText(/issuer public key/i), VALID_KEY);
    await user.type(screen.getByLabelText(/asset code/i), 'EC-O!');
    await user.type(screen.getByLabelText(/asset issuer/i), SECOND_KEY);
    await user.click(screen.getByRole('button', { name: 'Create community' }));

    await waitFor(() =>
      expect(screen.getByLabelText(/asset code/i)).toHaveAttribute('aria-invalid', 'true')
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a name shorter than two characters', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    render(<CreateCommunityForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/community name/i), 'E');
    await user.type(screen.getByLabelText(/issuer public key/i), VALID_KEY);
    await user.type(screen.getByLabelText(/asset code/i), 'ECO');
    await user.type(screen.getByLabelText(/asset issuer/i), SECOND_KEY);
    await user.click(screen.getByRole('button', { name: 'Create community' }));

    expect(await screen.findByText(/name must be at least 2 characters/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a submit whose issuer differs from the connected wallet', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    render(<CreateCommunityForm walletAddress={VALID_KEY} onSubmit={onSubmit} />);
    // The field is read-only in the UI, so the guard is exercised by removing
    // the lock attribute the way a tampered DOM would.
    const issuer = screen.getByLabelText(/issuer public key/i);
    issuer.removeAttribute('readonly');
    await user.clear(issuer);
    await user.type(issuer, SECOND_KEY);
    await user.type(screen.getByLabelText(/community name/i), 'EcoDAO');
    await user.type(screen.getByLabelText(/asset code/i), 'ECO');
    await user.type(screen.getByLabelText(/asset issuer/i), SECOND_KEY);
    await user.click(screen.getByRole('button', { name: 'Create community' }));

    expect(await screen.findByText(/must match the connected wallet/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('pre-fills fields from defaultValues', () => {
    render(
      <CreateCommunityForm
        onSubmit={jest.fn()}
        defaultValues={{ name: 'Preset', assetCode: 'PRE' }}
      />
    );

    expect(screen.getByLabelText(/community name/i)).toHaveValue('Preset');
    expect(screen.getByLabelText(/asset code/i)).toHaveValue('PRE');
  });

  it('posts to /api/v1/communities when no onSubmit is provided and reports the result', async () => {
    const user = userEvent.setup();
    const onSuccess = jest.fn();
    const onCreated = jest.fn();
    const created = { id: 'community-api' };
    mockPost.mockResolvedValue(created);

    render(<CreateCommunityForm onSuccess={onSuccess} onCreated={onCreated} />);
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create community' }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/api/v1/communities', {
        name: 'EcoDAO',
        description: 'A community for renewable energy',
        issuerPublicKey: VALID_KEY,
        assetCode: 'ECO',
        assetIssuer: SECOND_KEY,
      })
    );
    expect(onSuccess).toHaveBeenCalledWith(created);
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it('does not report success or show the status message when submission fails', async () => {
    const user = userEvent.setup();
    const onSuccess = jest.fn();
    const onSubmit = jest.fn().mockRejectedValue(new Error('boom'));

    render(<CreateCommunityForm onSubmit={onSubmit} onSuccess={onSuccess} />);
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create community' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('maps API field errors onto the matching field', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockRejectedValue(
      new ApiError('Validation failed', {
        status: 400,
        details: [{ path: 'assetCode', message: 'Asset code is already taken' }],
      })
    );

    render(<CreateCommunityForm onSubmit={onSubmit} />);
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create community' }));

    expect(await screen.findByText('Asset code is already taken')).toBeInTheDocument();
    expect(screen.getByLabelText(/asset code/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders a cancel button only when onCancel is given and calls it', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();

    const { rerender } = render(<CreateCommunityForm onSubmit={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    rerender(<CreateCommunityForm onSubmit={jest.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses a custom submit label and labels the form for assistive tech', () => {
    render(<CreateCommunityForm onSubmit={jest.fn()} submitLabel="Launch" />);

    expect(screen.getByRole('button', { name: 'Launch' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Create community' })).toBeInTheDocument();
  });
});
