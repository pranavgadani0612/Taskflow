const fs = require('fs');
const file = 'd:/Documents/Desktop/Taskflow/Task-flow-backend-main/backend/routes/leaveRoutes.js';
let content = fs.readFileSync(file, 'utf8');

// 1. applyApprovedLeave
const applyTarget = `const applyApprovedLeave = async (leave) => {
  const col = BALANCE_COLUMN[leave.leave_type];
  if (col) {
    await pool.query(\`UPDATE leave_balances SET \${col} = \${col} - ? WHERE user_id = ?\`, [parseFloat(leave.total_days), leave.user_id]);
  }`;

const applyReplacement = `const applyApprovedLeave = async (leave) => {
  const col = BALANCE_COLUMN[leave.leave_type];
  if (col) {
    await pool.query(
      \`UPDATE leave_balances 
       SET \${col} = \${col} - ? 
       WHERE user_id = ? OR (user_email = ? AND user_email != '')\`, 
      [parseFloat(leave.total_days), leave.user_id, leave.user_email || '']
    );
  }`;

// 2. revertApprovedLeave
const revertTarget = `const revertApprovedLeave = async (leave) => {
  const col = BALANCE_COLUMN[leave.leave_type];
  if (col) {
    await pool.query(\`UPDATE leave_balances SET \${col} = \${col} + ? WHERE user_id = ?\`, [parseFloat(leave.total_days), leave.user_id]);
  }`;

const revertReplacement = `const revertApprovedLeave = async (leave) => {
  const col = BALANCE_COLUMN[leave.leave_type];
  if (col) {
    await pool.query(
      \`UPDATE leave_balances 
       SET \${col} = \${col} + ? 
       WHERE user_id = ? OR (user_email = ? AND user_email != '')\`, 
      [parseFloat(leave.total_days), leave.user_id, leave.user_email || '']
    );
  }`;

// 3. Low balance check in action endpoint
const checkTarget = `      const [balRows] = await pool.query(\`SELECT \${col} AS bal FROM leave_balances WHERE user_id = ? LIMIT 1\`, [leave.user_id]);`;

const checkReplacement = `      const [balRows] = await pool.query(
        \`SELECT \${col} AS bal FROM leave_balances WHERE user_id = ? OR (user_email = ? AND user_email != '') LIMIT 1\`,
        [leave.user_id, leave.user_email || '']
      );`;

function doReplace(c, n, r) {
  const normN = n.replace(/\r\n/g, '\n');
  const normC = c.replace(/\r\n/g, '\n');
  if (normC.includes(normN)) {
    return normC.replace(normN, r.replace(/\r\n/g, '\n'));
  }
  return null;
}

let newContent = doReplace(content, applyTarget, applyReplacement);
if (newContent) {
  newContent = doReplace(newContent, revertTarget, revertReplacement);
  if (newContent) {
    newContent = doReplace(newContent, checkTarget, checkReplacement);
    if (newContent) {
      fs.writeFileSync(file, newContent, 'utf8');
      console.log('leaveRoutes.js updated with user_id OR user_email deduction!');
    } else {
      console.error('checkTarget not found');
    }
  } else {
    console.error('revertTarget not found');
  }
} else {
  console.error('applyTarget not found');
}

