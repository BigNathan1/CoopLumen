import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateCommunityForm } from '../CreateCommunityForm';

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
});
