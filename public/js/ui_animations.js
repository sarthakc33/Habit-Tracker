/**
 * ui_animations.js
 * Premium animation library for Reality Check
 * Handles 3D tilt effects, mini canvas sparklines, count-up animations, and dynamic typing
 */

class UIAnimations {
  static init() {
    this.initMagneticCards();
    this.initGreetingTyping();
  }

  // 1. 3D Tilt Effect on cards
  static initMagneticCards() {
    document.querySelectorAll('.card, .stat-card, .heatmap-widget, .cal-strip').forEach(card => {
      card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        // Scale down the extreme edges for a softer 3D tilt
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        // Apply 3D rotate
        card.style.transform = `perspective(1000px) rotateX(${-y * 10}deg) rotateY(${x * 10}deg) translateY(-6px)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0)';
      });
    });
  }

  static drawSparkAnimations = {};
  static drawSparkline(canvasId, color, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    if (this.drawSparkAnimations[canvasId]) {
      cancelAnimationFrame(this.drawSparkAnimations[canvasId]);
    }
    
    let offset = 0;
    
    const animate = () => {
      offset -= 0.5; // continuous visual flow
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement.getBoundingClientRect();
      
      if(rect.width === 0) {
        this.drawSparkAnimations[canvasId] = requestAnimationFrame(animate);
        return;
      }
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      
      const w = rect.width;
      const h = rect.height;
      
      ctx.clearRect(0, 0, w, h);
      
      if (!data || data.length < 2) return;
      
      const max = Math.max(...data, 1);
      const min = Math.min(...data, 0);
      const range = max - min;
      const stepX = w / (data.length - 1);
      
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      let baseColor = color.startsWith('var') ? (
        color.includes('cyan') ? '0, 229, 255' :
        color.includes('violet') ? '168, 85, 247' :
        color.includes('green') ? '34, 211, 160' :
        '245, 158, 11'
      ) : '255, 255, 255';

      grad.addColorStop(0, `rgba(${baseColor}, 0.5)`);
      grad.addColorStop(1, `rgba(${baseColor}, 0)`);
      
      ctx.beginPath();
      ctx.moveTo(0, h);
      
      const points = [];
      data.forEach((val, i) => {
        const wave = Math.sin((offset * 0.05) + (i * 0.8)) * (h * 0.08); // Breathing sine wave
        const y = h - ((val - min) / (range || 1)) * (h * 0.7) - (h * 0.15) + wave;
        points.push({x: i * stepX, y});
      });
      
      ctx.lineTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      
      ctx.strokeStyle = `rgb(${baseColor})`;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      
      const lastP = points[points.length-1];
      ctx.beginPath();
      ctx.arc(lastP.x, lastP.y, 4, 0, Math.PI*2);
      ctx.fillStyle = `rgb(${baseColor})`;
      ctx.fill();
      ctx.shadowColor = `rgba(${baseColor}, 0.8)`;
      ctx.shadowBlur = 10;
      ctx.fill();
      
      this.drawSparkAnimations[canvasId] = requestAnimationFrame(animate);
    };
    
    animate();
  }

  // 3. Dynamic typing effect for greeting user name
  static initGreetingTyping() {
    const el = document.getElementById('greeting-name');
    if (!el) return;
    
    // Save original for later
    const name = el.textContent || "Achiever";
    el.textContent = "";
    
    let i = 0;
    function type() {
      if (i < name.length) {
        el.textContent += name.charAt(i);
        i++;
        // Random typing speed for realism
        setTimeout(type, Math.random() * 50 + 50);
      }
    }
    setTimeout(type, 1500); // Start after entrance animations
  }
}

// Ensure it loads properly
document.addEventListener('DOMContentLoaded', () => {
    UIAnimations.init();
});
