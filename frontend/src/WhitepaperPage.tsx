import React from 'react';
import { ArrowLeft, BookOpen, Cpu, Shield, Zap, TrendingUp, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const WhitepaperPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '80px' }}>
      <button 
        onClick={() => navigate('/')} 
        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '32px' }}
      >
        <ArrowLeft size={18} />
        Back to App
      </button>

      <div style={{ textAlign: 'center', marginBottom: '64px' }}>
        <div style={{ 
          display: 'inline-flex', padding: '8px 24px', background: 'rgba(14, 165, 233, 0.05)', 
          borderRadius: '30px', border: '1px solid rgba(14, 165, 233, 0.2)', color: 'var(--accent-primary)',
          fontSize: '14px', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '24px'
        }}>
          <BookOpen size={16} style={{ marginRight: '8px' }} />
          PROTOCOL WHITEPAPER
        </div>
        <h1 style={{ fontSize: '48px', marginBottom: '24px', lineHeight: 1.1 }}>Domino Market Protocol</h1>
        <p style={{ fontSize: '20px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          A decentralized, autonomous prediction market engine utilizing Chainlink Coprocessor workflows and Gemini AI for resolving complex, multi-stage "Domino Effect" events.
        </p>
      </div>

      <div className="glass-card" style={{ padding: '40px', marginBottom: '32px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <Cpu className="text-primary" style={{ color: 'var(--accent-primary)' }} /> 
          1. The Coprocessor Runtime Environment (CRE)
        </h2>
        <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '16px' }}>
          Traditional prediction markets rely on simple binary outcomes reported by basic oracles (e.g., "Did Team X win? Yes/No"). The Domino Market Protocol introduces the <strong>Coprocessor Runtime Environment (CRE)</strong>, bridging decentralized smart contracts with off-chain, AI-driven computation.
        </p>
        <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          The CRE continuously scans global news sources and parses unstructured data using Google's Gemini models. It forms a consensus to achieve deterministic truth for complex qualitative events that cannot be easily queried via standard APIs.
        </p>
      </div>

      <div className="glass-card" style={{ padding: '40px', marginBottom: '32px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <Layers className="text-primary" style={{ color: 'var(--accent-tertiary)' }} /> 
          2. The "Domino Effect" Architecture
        </h2>
        <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '24px' }}>
          Unlike single-event markets, Domino Markets track causality. A market is defined by a <strong>Trigger Event (A)</strong> and a speculative <strong>Target Outcome (B)</strong>.
        </p>
        
        <div style={{ background: 'var(--bg-dark)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)', marginBottom: '24px' }}>
          <h4 style={{ marginBottom: '12px', color: 'var(--text-primary)' }}>Phase 1: Monitoring A</h4>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
            The AI continuously monitors for the Trigger Event. Users pool liquidity based on whether they believe Event A will cause Event B. If Event A never occurs before the deadline, the market expires and funds are returned.
          </p>
        </div>

        <div style={{ background: 'var(--bg-dark)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <h4 style={{ marginBottom: '12px', color: 'var(--text-primary)' }}>Phase 2: Monitoring B</h4>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
            Once Event A is verified by the CRE, the contract state advances autonomously. The timeline begins for Event B. The market resolves based on whether the Target Outcome actually materializes within the specified timeframe.
          </p>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '40px', marginBottom: '32px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <Shield className="text-primary" style={{ color: 'var(--success)' }} /> 
          3. Decentralized Settlement
        </h2>
        <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '16px' }}>
          Security is maintained through cryptographic proofs and on-chain settlement logic. The CRE cannot alter market rules or steal funds; it only dictates state transitions based on pre-agreed prompts established at market creation.
        </p>
        <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          When the CRE reaches a conclusion (Yes/No for Event B), it signs a cryptographic payload. This payload is submitted to the <code>TradingEngine.sol</code> contract, which independently verifies the signature, updates the market state, and unlocks liquidity proportional to the winning automated market maker (AMM) shares.
        </p>
      </div>

      <div className="glass-card" style={{ padding: '40px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <Zap className="text-primary" style={{ color: 'var(--warning)' }} /> 
          4. Autonomous Generation
        </h2>
        <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          To ensure continuous engagement, Domino Market utilizes an autonomous agent loop. The generator script pulls breaking global headlines every 15 minutes, invents highly logical causal scenarios (Domino Effects), pins the metadata to IPFS, and deploys the new smart contracts to the Sepolia network. This creates a fully self-sustaining prediction ecosystem without human intervention.
        </p>
      </div>

    </section>
  );
};

export default WhitepaperPage;
