import { getTotalSupply } from '../assets';
import { StellarService } from '../stellar';

jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    call: jest.fn((_operationName: string, request: () => unknown) => request()),
  },
}));

describe('getTotalSupply', () => {
  const mockGetServer = StellarService.getServer as jest.Mock;

  beforeEach(() => {
    mockGetServer.mockReset();
  });

  it('returns the amount reported by the Horizon asset stats endpoint', async () => {
    const forIssuer = jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({ records: [{ amount: '5000.0000000' }] }),
      }),
    });
    const forCode = jest.fn().mockReturnValue({ forIssuer });
    mockGetServer.mockReturnValue({ assets: () => ({ forCode }) });

    const supply = await getTotalSupply('ECO', 'GISSUER');

    expect(supply).toBe('5000.0000000');
    expect(forCode).toHaveBeenCalledWith('ECO');
    expect(forIssuer).toHaveBeenCalledWith('GISSUER');
  });

  it('returns zero supply when Horizon has no record for the asset', async () => {
    const forIssuer = jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({ records: [] }),
      }),
    });
    const forCode = jest.fn().mockReturnValue({ forIssuer });
    mockGetServer.mockReturnValue({ assets: () => ({ forCode }) });

    const supply = await getTotalSupply('ECO', 'GISSUER');

    expect(supply).toBe('0.0000000');
  });
});
