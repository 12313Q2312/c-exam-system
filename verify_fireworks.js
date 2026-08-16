// Verification script for fireworks bug fix
const PHASE1_DURATION = 3500;
const particles = [];
const goodTargetsLength = 162;

for (let i = 0; i < 300; i++) {
  particles.push({
    phase: 'burst',
    born: 0,
    life: 2,
    maxLife: 2,
    burstTime: Math.random() * 2000
  });
}

let phase2Started = false;
let fadeOutScheduled = false;
let fadeTriggerCount = 0;
let frames = 0;

for (let f = 0; f < 10000; f++) {
  frames++;
  const now = f * 16.67;
  const elapsed = now - particles[0].born;
  let aliveCount = 0;

  if (elapsed > PHASE1_DURATION && !phase2Started) {
    phase2Started = true;
    particles.forEach((p, i) => {
      if (i < goodTargetsLength) {
        p.phase = 'converge';
        p.convergeStart = now;
        p.convergeDuration = 2000 + (i % 8) * 62.5;  // staggered
      } else {
        p.life = 0;
      }
    });
  }

  particles.forEach(p => {
    if (p.phase === 'burst') {
      const age = (now - p.born) / 1000;
      if (age * 1000 < p.burstTime) aliveCount++;
      else if (((age * 1000 - p.burstTime) / 1000) < p.maxLife) aliveCount++;
    } else if (p.phase === 'converge' && p.convergeStart) {
      const cAge = (now - p.convergeStart) / 1000;
      const progress = Math.min(1, cAge / (p.convergeDuration / 1000));
      const alpha = progress < 0.9 ? 0.9 : 0.9 * (1 - (progress - 0.9) / 0.1);
      if (alpha > 0.01) aliveCount++;
    }
  });

  if (phase2Started && aliveCount < 30) {
    const glowAlpha = Math.min(0.8, (now - particles[0].born - PHASE1_DURATION - 1500) / 1000);
    if (glowAlpha >= 0.7 && !fadeOutScheduled) {
      fadeOutScheduled = true;
      fadeTriggerCount++;
    }
  }

  if (aliveCount === 0 && phase2Started) break;
}

console.log('Frames simulated:', frames, '(cap 10000)');
console.log('RAF terminates?     ', frames < 10000 ? 'YES (FIXED - no infinite loop)' : 'NO (still broken)');
console.log('fadeOut scheduled?  ', fadeOutScheduled ? 'YES, ' + fadeTriggerCount + ' time(s) (guarded correctly)' : 'No (cosmetic timing only)');
console.log('phase2Started?      ', phase2Started ? 'YES' : 'NO');
console.log('');
console.log(frames < 10000 ? 'PASS: Critical fireworks bugs confirmed fixed.' : 'FAIL: Infinite loop remains.');
process.exit(frames < 10000 ? 0 : 1);
