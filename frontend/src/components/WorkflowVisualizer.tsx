import React from 'react';
import { CheckCircle2, Circle, Zap, Target, Award } from 'lucide-react';
import { type MarketData } from '../services/MarketService';

interface WorkflowVisualizerProps {
  market: MarketData;
}

const WorkflowVisualizer: React.FC<WorkflowVisualizerProps> = ({ market }) => {
  const phases = [
    { id: 0, label: 'Event A Monitoring', sub: market.descriptionA, icon: Zap },
    { id: 1, label: 'Conditional Event B', sub: market.descriptionB, icon: Target },
    { id: 2, label: 'Market Settlement', sub: 'Final distribution', icon: Award }
  ];

  return (
    <div className="glass-card" style={{ padding: '32px' }}>
      <h3 style={{ marginBottom: '32px', fontSize: '20px' }}>CRE Workflow Visualizer</h3>
      
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '40px' }}>
        {phases.map((phase, index) => {
          const isActive = market.state === phase.id;
          const isCompleted = market.state > phase.id;
          const StatusIcon = phase.id === market.state ? phase.icon : (isCompleted ? CheckCircle2 : Circle);
          
          return (
            <div key={phase.id} style={{ display: 'flex', gap: '20px', position: 'relative' }}>
              {/* Timeline Connector */}
              {index < phases.length - 1 && (
                <div style={{
                  position: 'absolute',
                  left: '15px',
                  top: '40px',
                  bottom: '-20px',
                  width: '2px',
                  background: isCompleted ? 'var(--success)' : 'rgba(255,255,255,0.05)',
                  zIndex: 0
                }} />
              )}
              
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: isActive ? 'var(--accent-primary)' : (isCompleted ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.05)'),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isActive ? 'white' : (isCompleted ? 'var(--success)' : 'var(--text-muted)'),
                zIndex: 1,
                border: isActive ? '4px solid rgba(124, 58, 237, 0.2)' : 'none'
              }}>
                <StatusIcon size={isActive ? 18 : 16} />
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <h4 style={{ 
                    fontSize: '16px', 
                    color: isActive ? 'white' : (isCompleted ? 'var(--text-primary)' : 'var(--text-muted)'),
                    margin: 0
                  }}>
                    {phase.label}
                  </h4>
                  {isActive && <span className="badge badge-monitoring" style={{ fontSize: '10px' }}>Active Polling</span>}
                  {isCompleted && <span style={{ fontSize: '10px', color: 'var(--success)', fontWeight: 600 }}>COMPLETED</span>}
                </div>
                <p style={{ 
                  fontSize: '14px', 
                  color: isCompleted || isActive ? 'var(--text-secondary)' : 'var(--text-muted)',
                  margin: 0
                }}>
                  {phase.sub}
                </p>
                
                {isActive && (
                  <div style={{ 
                    marginTop: '16px', 
                    padding: '12px', 
                    background: 'rgba(255,255,255,0.02)', 
                    borderRadius: '8px',
                    border: '1px dashed var(--border-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Real-time Consensus</span>
                        <span>0.67 Required</span>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div className="consensus-pulse" style={{ height: '100%', width: '40%', background: 'var(--accent-primary)' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
        .consensus-pulse {
          animation: pulse 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default WorkflowVisualizer;
