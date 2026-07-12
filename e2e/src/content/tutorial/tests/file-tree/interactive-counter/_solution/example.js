const countOutput = document.querySelector('#count-output');
const incrementButton = document.querySelector('#increment-button');
const decrementButton = document.querySelector('#decrement-button');
const resetButton = document.querySelector('#reset-button');

let count = 0;

function render() {
  countOutput.textContent = String(count);
}

incrementButton.addEventListener('click', () => {
  count += 1;
  render();
});

decrementButton.addEventListener('click', () => {
  count = Math.max(0, count - 1);
  render();
});

resetButton.addEventListener('click', () => {
  count = 0;
  render();
});

render();
