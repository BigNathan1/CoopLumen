import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '@/lib/api';
import { EditCommunityPageClient } from './EditCommunityPageClient';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

const community = {
  id: 'community-1',
  name: 'EcoDAO',
  description: 'Renewable energy cooperative',
  asset_code: 'ECO',
  asset_issuer: `G${'A'.repeat(55)}`,
  issuer_public_key: `G${'B'.repeat(55)}`,
};

describe('EditCommunityPageClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads the nested community response and saves changes through the route id', async () => {
    const user = userEvent.setup();
    const get = jest.spyOn(api, 'get').mockResolvedValue({ community });
    const put = jest.spyOn(api, 'put').mockResolvedValue({
      ...community,
      name: 'EcoDAO 2',
    });

    render(<EditCommunityPageClient communityId="community-1" />);

    expect(await screen.findByDisplayValue('EcoDAO')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/api/v1/communities/community-1');

    await user.clear(screen.getByLabelText(/community name/i));
    await user.type(screen.getByLabelText(/community name/i), 'EcoDAO 2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/api/v1/communities/community-1', {
        name: 'EcoDAO 2',
        description: 'Renewable energy cooperative',
      })
    );
    expect(await screen.findByText('Community changes saved.')).toBeInTheDocument();
  });

  it('shows a retryable error when the community cannot be loaded', async () => {
    const get = jest.spyOn(api, 'get').mockRejectedValue(new Error('Service unavailable'));

    render(<EditCommunityPageClient communityId="missing" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
    expect(get).toHaveBeenCalledWith('/api/v1/communities/missing');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
