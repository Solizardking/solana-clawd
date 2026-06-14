import { describe, expect, it } from 'vitest';
import { routeWithKeywords } from '../deepseek.js';

describe('routeWithKeywords', () => {
  it('routes status for unknown text', () => {
    expect(routeWithKeywords('hello').action).toBe('status');
  });

  it('routes bitaxe_pause', () => {
    expect(routeWithKeywords('please pause the miner').action).toBe('bitaxe_pause');
  });

  it('routes bitaxe_resume', () => {
    expect(routeWithKeywords('resume mining').action).toBe('bitaxe_resume');
  });

  it('routes bitaxe_reboot', () => {
    expect(routeWithKeywords('reboot the bitaxe').action).toBe('bitaxe_reboot');
  });

  it('routes bitaxe_hashrate', () => {
    expect(routeWithKeywords('what is the hashrate right now').action).toBe('bitaxe_hashrate');
  });

  it('routes bitaxe_efficiency', () => {
    expect(routeWithKeywords('show efficiency in W/GH').action).toBe('bitaxe_efficiency');
  });

  it('routes optimize', () => {
    expect(routeWithKeywords('optimize bitcoin lottery chances').action).toBe('optimize');
  });

  it('routes ore_checkpoint', () => {
    expect(routeWithKeywords('run ore checkpoint').action).toBe('ore_checkpoint');
  });

  it('routes ore_claim', () => {
    expect(routeWithKeywords('claim my ore rewards').action).toBe('ore_claim');
  });

  it('routes vulcan_ticker with symbol', () => {
    const intent = routeWithKeywords('what is the price of SOL');
    expect(intent.action).toBe('vulcan_ticker');
    expect(intent.symbol).toBe('SOL');
  });

  it('routes vulcan_ta for RSI', () => {
    expect(routeWithKeywords('show me RSI on SOL').action).toBe('vulcan_ta');
  });

  it('routes vulcan_positions', () => {
    expect(routeWithKeywords('show my open positions').action).toBe('vulcan_positions');
  });

  it('routes vulcan_portfolio', () => {
    expect(routeWithKeywords('show my portfolio equity').action).toBe('vulcan_portfolio');
  });

  it('routes vulcan_margin', () => {
    expect(routeWithKeywords('check my margin health').action).toBe('vulcan_margin');
  });

  it('routes perps_paper_trade long', () => {
    const intent = routeWithKeywords('paper long SOL $100');
    expect(intent.action).toBe('perps_paper_trade');
    expect(intent.side).toBe('long');
  });

  it('routes perps_paper_trade short', () => {
    const intent = routeWithKeywords('paper short ETH $50');
    expect(intent.action).toBe('perps_paper_trade');
    expect(intent.side).toBe('short');
  });

  it('routes wallet_assets', () => {
    expect(routeWithKeywords('show my wallet assets').action).toBe('wallet_assets');
  });

  it('routes bitaxe_freq_set with MHz value', () => {
    const intent = routeWithKeywords('set frequency to 500 MHz');
    expect(intent.action).toBe('bitaxe_freq_set');
    expect(intent.frequencyMhz).toBe(500);
  });

  it('routes bitaxe_led_set with color', () => {
    const intent = routeWithKeywords('set the base LED to purple');
    expect(intent.action).toBe('bitaxe_led_set');
    expect(intent.ledColor).toBe('purple');
  });

  it('routes bitaxe_led_cycle', () => {
    expect(routeWithKeywords('cycle the bitaxe led rainbow').action).toBe('bitaxe_led_cycle');
    expect(routeWithKeywords('set up the bitaxe led to change colors').action).toBe('bitaxe_led_cycle');
  });
});
