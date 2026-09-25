import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditCommunityForm } from '../EditCommunityForm';

const community = {
  id: 'community-1',
  name: 'EcoDAO',
  description: 'Renewable energy cooperative',
  asset_code: 'ECO',
  asset_issuer: `G${'A'.repeat(55)}`,
  issuer_public_key: `G${'B'.repeat(55)}`,
};

describe('EditCommunityForm', () => {
  it('pre-populates the existing community and submits the editable fields', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue({ ...community, name: 'EcoDAO 2' });

    render(<EditCommunityForm community={community} onSubmit={onSubmit} />);

    expect(screen.getByLabelText(/community name/i)).toHaveValue('EcoDAO');
    expect(screen.getByLabelText(/description/i)).toHaveValue('Renewable energy cooperative');
    expect(screen.getByText('ECO')).toBeInTheDocument();
    expect(screen.getByText(community.asset_issuer)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/community name/i));
    await user.type(screen.getByLabelText(/community name/i), 'EcoDAO 2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'EcoDAO 2',
        description: 'Renewable energy cooperative',
      })
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Community changes saved.');
  });

  it('sends null when the description is cleared', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(community);

    render(<EditCommunityForm community={community} onSubmit={onSubmit} />);
    await user.clear(screen.getByLabelText(/description/i));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'EcoDAO',
        description: null,
      })
    );
  });

  it('rejects an invalid name without invoking the update callback', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    render(<EditCommunityForm community={community} onSubmit={onSubmit} />);
    await user.clear(screen.getByLabelText(/community name/i));
    await user.type(screen.getByLabelText(/community name/i), 'x');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Name must be at least 2 characters')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders an actionable unavailable state when no community is supplied', () => {
    render(<EditCommunityForm />);
    expect(screen.getByRole('alert')).toHaveTextContent('Community unavailable');
  });
});
