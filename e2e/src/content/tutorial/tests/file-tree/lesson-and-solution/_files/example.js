const button = document.querySelector('#demo-button');
const status = document.querySelector('#status');
let clicks = 0;

button?.addEventListener('click', () => {
  clicks += 1;
  if (status) status.textContent = `The live preview was clicked ${clicks} time${clicks === 1 ? '' : 's'}.`;
});

export default 'Interactive JavaScript preview';
