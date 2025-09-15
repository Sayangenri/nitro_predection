/**
 * LMSR (Logarithmic Market Scoring Rule) Pricing Engine
 * Implements off-chain calculation for state channel prediction markets
 */

import { LMSRParams, DEFAULT_LMSR_PARAMS, TradePreview } from './types.js';

export class LMSRPricer {
  private params: LMSRParams;

  constructor(params: LMSRParams = DEFAULT_LMSR_PARAMS) {
    this.params = params;
  }

  /**
   * Calculate dynamic liquidity parameter b
   * Formula: b = b0 * (1 + alpha*sqrt(volume/V0) + beta*ln(1+txCount))
   */
  calculateB(totalVolume: bigint, txCount: bigint): bigint {
    if (totalVolume === BigInt(0) && txCount === BigInt(0)) {
      return this.params.b0;
    }

    // Calculate volume ratio: volume / V0
    const volumeRatio = (totalVolume * BigInt(10**18)) / this.params.V0;
    
    // Calculate sqrt(volume/V0)
    const sqrtVolume = this.sqrt(volumeRatio);
    
    // Calculate ln(1 + txCount)
    const lnTxCount = this.ln(BigInt(10**18) + txCount * BigInt(10**18));
    
    // Calculate multiplier: 1 + alpha*sqrt + beta*ln
    const multiplier = BigInt(10**18) + 
      (this.params.alpha * sqrtVolume) / BigInt(10**18) + 
      (this.params.beta * lnTxCount) / BigInt(10**18);
      
    // Return b = b0 * multiplier
    return (this.params.b0 * multiplier) / BigInt(10**18);
  }

  /**
   * Calculate current marginal prices using LMSR formula
   * p_yes = e^(q_yes/b) / (e^(q_yes/b) + e^(q_no/b))
   * p_no = e^(q_no/b) / (e^(q_yes/b) + e^(q_no/b))
   */
  getPrice(qYes: bigint, qNo: bigint, b: bigint): [bigint, bigint] {
    // Handle edge case: both quantities are zero
    if (qYes === BigInt(0) && qNo === BigInt(0)) {
      return [BigInt(5 * 10**17), BigInt(5 * 10**17)]; // 0.5, 0.5
    }

    // Calculate e^(q_yes/b) and e^(q_no/b)
    const expYes = this.expApprox((qYes * BigInt(10**18)) / b);
    const expNo = this.expApprox((qNo * BigInt(10**18)) / b);
    const sumExp = expYes + expNo;
    
    if (sumExp === BigInt(0)) {
      return [BigInt(5 * 10**17), BigInt(5 * 10**17)]; // fallback to 0.5, 0.5
    }
    
    // Calculate marginal prices
    const pYes = (expYes * BigInt(10**18)) / sumExp;
    const pNo = (expNo * BigInt(10**18)) / sumExp;
    
    return [pYes, pNo];
  }

  /**
   * Calculate shares received for a given payment amount
   * Uses binary search to solve: C(q + delta) - C(q) = payAmount
   */
  calculateShares(
    payAmount: bigint, 
    isYes: boolean, 
    currentQYes: bigint, 
    currentQNo: bigint, 
    b: bigint
  ): bigint {
    const currentCost = this.getCost(currentQYes, currentQNo, b);
    const targetCost = currentCost + payAmount;
    
    // Binary search for the number of shares
    let low = BigInt(0);
    let high = payAmount * BigInt(10); // Upper bound estimate
    let iterations = 0;
    const maxIterations = 50;
    
    while (low < high && iterations < maxIterations) {
      const mid = (low + high) / BigInt(2);
      const newQYes = isYes ? currentQYes + mid : currentQYes;
      const newQNo = isYes ? currentQNo : currentQNo + mid;
      const newCost = this.getCost(newQYes, newQNo, b);
      
      if (newCost < targetCost) {
        low = mid + BigInt(1);
      } else {
        high = mid;
      }
      iterations++;
    }
    
    return low;
  }

  /**
   * Preview a trade before execution
   */
  previewTrade(
    payAmount: bigint,
    isYes: boolean,
    currentQYes: bigint,
    currentQNo: bigint,
    currentB: bigint,
    feeRate: bigint
  ): TradePreview {
    // Calculate fee and net amount
    const fee = (payAmount * feeRate) / BigInt(10000);
    const netAmount = payAmount - fee;
    
    // Calculate expected shares
    const expectedShares = this.calculateShares(
      netAmount, 
      isYes, 
      currentQYes, 
      currentQNo, 
      currentB
    );
    
    // Calculate new quantities after trade
    const newQYes = isYes ? currentQYes + expectedShares : currentQYes;
    const newQNo = isYes ? currentQNo : currentQNo + expectedShares;
    
    // Calculate new price
    const [newPriceYes, newPriceNo] = this.getPrice(newQYes, newQNo, currentB);
    const newPrice = isYes ? newPriceYes : newPriceNo;
    
    // Calculate current price for comparison
    const [currentPriceYes, currentPriceNo] = this.getPrice(currentQYes, currentQNo, currentB);
    const currentPrice = isYes ? currentPriceYes : currentPriceNo;
    
    // Calculate price impact
    const priceImpact = currentPrice > 0 
      ? ((newPrice - currentPrice) * BigInt(10**18)) / currentPrice
      : BigInt(0);
    
    // Calculate average price per share
    const avgPrice = expectedShares > 0 
      ? (netAmount * BigInt(10**18)) / expectedShares 
      : BigInt(0);
    
    return {
      expectedShares,
      newPrice,
      priceImpact,
      avgPrice,
      fee,
      netAmount
    };
  }

  /**
   * LMSR cost function: C(q_yes, q_no) = b * ln(e^(q_yes/b) + e^(q_no/b))
   */
  private getCost(qYes: bigint, qNo: bigint, b: bigint): bigint {
    // Handle edge case: both quantities are zero
    if (qYes === BigInt(0) && qNo === BigInt(0)) {
      return (b * this.ln(BigInt(2) * BigInt(10**18))) / BigInt(10**18);
    }
    
    // Calculate e^(q_yes/b) and e^(q_no/b)
    const expYes = this.expApprox((qYes * BigInt(10**18)) / b);
    const expNo = this.expApprox((qNo * BigInt(10**18)) / b);
    const sum = expYes + expNo;
    
    // Return b * ln(sum)
    return (b * this.ln(sum)) / BigInt(10**18);
  }

  /**
   * Approximate e^x using Taylor series (gas efficient)
   * e^x ≈ 1 + x + x²/2! + x³/3! + x⁴/4! + x⁵/5!
   */
  private expApprox(x: bigint): bigint {
    if (x === BigInt(0)) return BigInt(10**18);
    if (x >= BigInt(42) * BigInt(10**18)) return BigInt(2**256 - 1); // Overflow protection
    
    let result = BigInt(10**18);
    let term = x;
    
    // Add terms: x, x²/2!, x³/3!, x⁴/4!, x⁵/5!
    result += term;
    term = (term * x) / (BigInt(2) * BigInt(10**18));
    result += term;
    term = (term * x) / (BigInt(3) * BigInt(10**18));
    result += term;
    term = (term * x) / (BigInt(4) * BigInt(10**18));
    result += term;
    term = (term * x) / (BigInt(5) * BigInt(10**18));
    result += term;
    
    return result;
  }

  /**
   * Natural logarithm using binary approximation
   * ln(x) = log2(x) * ln(2)
   */
  private ln(x: bigint): bigint {
    if (x <= BigInt(0)) throw new Error("ln: x must be positive");
    if (x === BigInt(10**18)) return BigInt(0);
    
    // Use change of base: ln(x) = log2(x) * ln(2)
    const log2x = this.log2(x);
    return (log2x * BigInt(693147180559945309)) / BigInt(10**18); // ln(2) ≈ 0.693147180559945309
  }

  /**
   * Binary logarithm approximation
   */
  private log2(x: bigint): bigint {
    if (x <= BigInt(0)) throw new Error("log2: x must be positive");
    
    let result = BigInt(0);
    let y = x;
    
    // Integer part: count powers of 2
    while (y >= BigInt(2) * BigInt(10**18)) {
      y /= BigInt(2);
      result += BigInt(10**18);
    }
    
    // Fractional part (simplified approximation)
    if (y >= BigInt(15) * BigInt(10**17)) {
      result += BigInt(5) * BigInt(10**17); // log2(1.5) ≈ 0.585
    } else if (y >= BigInt(125) * BigInt(10**16)) {
      result += BigInt(32) * BigInt(10**16); // log2(1.25) ≈ 0.322
    }
    
    return result;
  }

  /**
   * Square root using Babylonian method
   */
  private sqrt(x: bigint): bigint {
    if (x === BigInt(0)) return BigInt(0);
    
    // Babylonian method (Newton's method for square root)
    let z = (x + BigInt(1)) / BigInt(2);
    let y = x;
    
    while (z < y) {
      y = z;
      z = (x / z + z) / BigInt(2);
    }
    
    return y;
  }

  /**
   * Validate LMSR invariants
   */
  validateState(qYes: bigint, qNo: bigint, b: bigint): boolean {
    // Check non-negative quantities
    if (qYes < 0 || qNo < 0 || b <= 0) return false;
    
    // Check prices sum to 1 (within tolerance)
    const [pYes, pNo] = this.getPrice(qYes, qNo, b);
    const priceSum = pYes + pNo;
    const tolerance = BigInt(10**15); // 0.001 tolerance
    
    return Math.abs(Number(priceSum - BigInt(10**18))) < Number(tolerance);
  }
}

