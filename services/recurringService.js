const { v4: uuidv4 } = require('uuid');

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Generates today's instances of recurring task templates.
 * @param {string} userId
 * @param {object} data - The tasks data object { tasks: [], history: [] }
 * @returns {boolean} - Whether any new tasks were created
 */
function generateRecurringTasks(userId, data) {
  const today = new Date().toISOString().split('T')[0];
  const todayDayName = DAY_NAMES[new Date().getDay()];
  const todayDayNum = new Date().getDay(); // 0=Sun, 6=Sat
  let created = false;

  // Find recurring templates for this user
  const templates = data.tasks.filter(t =>
    t.userId === userId &&
    t.isRecurring &&
    t.isTemplate
  );

  for (const tpl of templates) {
    // Check if we should generate today
    let shouldGenerate = false;

    switch (tpl.repeat) {
      case 'daily':
        shouldGenerate = true;
        break;
      case 'weekly':
        // Same weekday as the template was created
        const createdDay = new Date(tpl.createdAt).getDay();
        shouldGenerate = todayDayNum === createdDay;
        break;
      case 'weekdays':
        shouldGenerate = todayDayNum >= 1 && todayDayNum <= 5;
        break;
      case 'custom':
        shouldGenerate = (tpl.repeatDays || []).includes(todayDayName);
        break;
      default:
        break;
    }

    if (!shouldGenerate) continue;

    // Check if today's instance already exists
    const alreadyExists = data.tasks.some(t =>
      t.userId === userId &&
      t.recurringParentId === tpl.id &&
      t.date === today &&
      !t.isTemplate
    );

    if (alreadyExists) continue;

    // Create today's instance
    const instance = {
      id: uuidv4(),
      userId: tpl.userId,
      name: tpl.name,
      priority: tpl.priority,
      estimatedTime: tpl.estimatedTime,
      actualTime: 0,
      category: tpl.category,
      date: today,
      status: 'pending',
      createdAt: new Date().toISOString(),
      completedAt: null,
      timerSessions: [],
      isRecurring: true,
      isTemplate: false,
      recurringParentId: tpl.id,
      repeat: tpl.repeat,
      repeatDays: tpl.repeatDays || []
    };

    data.tasks.push(instance);
    created = true;
  }

  return created;
}

module.exports = { generateRecurringTasks };
