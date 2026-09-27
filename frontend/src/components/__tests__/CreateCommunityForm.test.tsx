import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateCommunityForm } from '@/components/CreateCommunityForm';
import { useCreateCommunity } from '@/hooks/useCreateCommunity';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/hooks/useCreateCommunity');
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const mockUseCreateCommunity = useCreateCommunity as jest.Mock;

const VALID_KEY_A = 'G' + 'A'.repeat(55);
const VALID_KEY_B = 'G' + 'B'.repeat(55);

function mockIdle() {
  mockUseCreateCommunity.mockReturnValue({
    createCommunity: jest.fn().mockResolvedValue(null),
    submitting: false,
    error: null,
  });
}

function mockSuccess(community = { id: 'uuid-1', name: 'EcoDAO' }) {
  mockUseCreateCommunity.mockReturnValue({
    createCommunity: jest.fn().mockResolvedValue(community),
    submitting: false,
    error: null,
  });
}

function mockSubmitting() {
  mockUseCreateCommunity.mockReturnValue({
    createCommunity: jest.fn().mockResolvedValue(null),
    submitting: true,
    error: null,
  });
}

describe('CreateCommunityForm', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIdle();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the form with a labelled main landmark', () => {
    render(<CreateCommunityForm />);
    expect(screen.getByRole('form', { name: /create community/i })).toBeInTheDocument();
  });

  it('renders all five labelled fields', () => {
    render(<CreateCommunityForm />);
    expect(screen.getByLabelText(/community name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/asset code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/asset issuer address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/governance issuer key/i)).toBeInTheDocument();
  });

  it('renders the submit button', () => {
    render(<CreateCommunityForm />);
    expect(screen.getByRole('button', { name: /create community/i })).toBeInTheDocument();
  });

  it('renders a cancel link pointing to /communities', () => {
    render(<CreateCommunityForm />);
    const cancel = screen.getByRole('link', { name: /cancel/i });
    expect(cancel).toHaveAttribute('href', '/communities');
  });

  // ── Required field markers ──────────────────────────────────────────────────

  it('marks name, assetCode, assetIssuer and issuerPublicKey as required', () => {
    render(<CreateCommunityForm />);
    expect(screen.getByLabelText(/community name/i)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/asset code/i)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/asset issuer address/i)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/governance issuer key/i)).toHaveAttribute(
      'aria-required',
      'true'
    );
  });

  it('does not mark description as required', () => {
    render(<CreateCommunityForm />);
    const desc = screen.getByLabelText(/description/i);
    expect(desc).not.toHaveAttribute('aria-required', 'true');
  });

  // ── Loading state ───────────────────────────────────────────────────────────

  it('disables the submit button while submitting', () => {
    mockSubmitting();
    render(<CreateCommunityForm />);
    expect(screen.getByRole('button', { name: /creating community/i })).toBeDisabled();
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('shows a validation error when name is too short', async () => {
    render(<CreateCommunityForm />);
    const nameInput = screen.getByLabelText(/community name/i);
    await userEvent.type(nameInput, 'a');
    await userEvent.tab(); // trigger onTouched validation
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/at least 2 characters/i);
    });
  });

  it('shows a validation error for an invalid asset code', async () => {
    render(<CreateCommunityForm />);
    const assetInput = screen.getByLabelText(/asset code/i);
    await userEvent.type(assetInput, 'INVALID!!');
    await userEvent.tab();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/letters and numbers only/i);
    });
  });

  it('shows a validation error for an invalid Stellar key in assetIssuer', async () => {
    render(<CreateCommunityForm />);
    const issuerInput = screen.getByLabelText(/asset issuer address/i);
    await userEvent.type(issuerInput, 'notakey');
    await userEvent.tab();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/valid stellar public key/i);
    });
  });

  it('shows a validation error for an invalid Stellar key in issuerPublicKey', async () => {
    render(<CreateCommunityForm />);
    const govInput = screen.getByLabelText(/governance issuer key/i);
    await userEvent.type(govInput, 'badkey');
    await userEvent.tab();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/valid stellar public key/i);
    });
  });

  // ── Successful submit ───────────────────────────────────────────────────────

  it('calls createCommunity with the trimmed field values on valid submit', async () => {
    const createCommunity = jest.fn().mockResolvedValue({ id: 'uuid-1', name: 'EcoDAO Lagos' });
    mockUseCreateCommunity.mockReturnValue({ createCommunity, submitting: false, error: null });

    render(<CreateCommunityForm />);

    await userEvent.type(screen.getByLabelText(/community name/i), 'EcoDAO Lagos');
    await userEvent.type(screen.getByLabelText(/description/i), 'A test community');
    await userEvent.type(screen.getByLabelText(/asset code/i), 'ECOLGS');
    await userEvent.type(screen.getByLabelText(/asset issuer address/i), VALID_KEY_A);
    await userEvent.type(screen.getByLabelText(/governance issuer key/i), VALID_KEY_B);

    await userEvent.click(screen.getByRole('button', { name: /create community/i }));

    await waitFor(() => {
      expect(createCommunity).toHaveBeenCalledWith({
        name: 'EcoDAO Lagos',
        description: 'A test community',
        assetCode: 'ECOLGS',
        assetIssuer: VALID_KEY_A,
        issuerPublicKey: VALID_KEY_B,
      });
    });
  });

  it('omits description when left blank', async () => {
    const createCommunity = jest.fn().mockResolvedValue({ id: 'uuid-1', name: 'EcoDAO Lagos' });
    mockUseCreateCommunity.mockReturnValue({ createCommunity, submitting: false, error: null });

    render(<CreateCommunityForm />);

    await userEvent.type(screen.getByLabelText(/community name/i), 'EcoDAO Lagos');
    await userEvent.type(screen.getByLabelText(/asset code/i), 'ECOLGS');
    await userEvent.type(screen.getByLabelText(/asset issuer address/i), VALID_KEY_A);
    await userEvent.type(screen.getByLabelText(/governance issuer key/i), VALID_KEY_B);

    await userEvent.click(screen.getByRole('button', { name: /create community/i }));

    await waitFor(() => {
      expect(createCommunity).toHaveBeenCalledWith(
        expect.objectContaining({ description: undefined })
      );
    });
  });

  // ── API error state ─────────────────────────────────────────────────────────

  it('shows a form-level error when createCommunity returns null', async () => {
    mockUseCreateCommunity.mockReturnValue({
      createCommunity: jest.fn().mockResolvedValue(null),
      submitting: false,
      error: null,
    });

    render(<CreateCommunityForm />);

    await userEvent.type(screen.getByLabelText(/community name/i), 'EcoDAO Lagos');
    await userEvent.type(screen.getByLabelText(/asset code/i), 'ECOLGS');
    await userEvent.type(screen.getByLabelText(/asset issuer address/i), VALID_KEY_A);
    await userEvent.type(screen.getByLabelText(/governance issuer key/i), VALID_KEY_B);

    await userEvent.click(screen.getByRole('button', { name: /create community/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to create community/i);
    });
  });

  // ── Accessibility ───────────────────────────────────────────────────────────

  it('marks fields as aria-invalid after a validation error', async () => {
    render(<CreateCommunityForm />);
    const nameInput = screen.getByLabelText(/community name/i);
    await userEvent.type(nameInput, 'x');
    await userEvent.tab();
    await waitFor(() => {
      expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    });
  });

  it('renders the community identity and stellar token fieldset legends', () => {
    render(<CreateCommunityForm />);
    expect(screen.getByText(/community identity/i)).toBeInTheDocument();
    expect(screen.getByText(/stellar token/i)).toBeInTheDocument();
  });
});
