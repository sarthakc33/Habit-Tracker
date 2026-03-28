import sys
with open('f:/Habit_Tracker_Redesigned1/Habit Tracker/public/css/calendar-heatmap.css', 'r') as f:
    css = f.read()

replacements = {
    'rgba(99,102,241,': 'rgba(191,0,255,',
    'rgba(6,182,212,': 'rgba(0,245,255,',
    'rgba(16,185,129,': 'rgba(0,255,136,',
    'rgba(245,158,11,': 'rgba(255,107,53,',
    'rgba(239,68,68,': 'rgba(255,0,110,',
    '#6366f1': 'var(--neon-purple)',
    '#10b981': 'var(--neon-green)',
    '#f59e0b': 'var(--neon-yellow)',
    '#ef4444': 'var(--neon-red)'
}
for k, v in replacements.items():
    css = css.replace(k, v)

with open('f:/Habit_Tracker_Redesigned1/Habit Tracker/public/css/calendar-heatmap.css', 'w') as f:
    f.write(css)
print('Done!')
