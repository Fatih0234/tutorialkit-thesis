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
  // Learner challenge: decrease the count without going below zero.
});

resetButton.addEventListener('click', () => {
  // Learner challenge: reset the count to zero.
});

render();
