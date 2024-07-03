// priorityQueue.js

class PriorityQueue {
    constructor() {
        this.heap = [];
    }

    enqueue(element, priority) {
        const item = { element, priority };
        this.heap.push(item);
        this._bubbleUp(this.heap.length - 1);
    }

    dequeue() {
        const max = this.heap[0];
        const end = this.heap.pop();
        if (this.heap.length > 0) {
            this.heap[0] = end;
            this._sinkDown(0);
        }
        return max;
    }

    peek() {
        return this.heap[0];
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    _bubbleUp(index) {
        const item = this.heap[index];
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            const parent = this.heap[parentIndex];
            if (item.priority <= parent.priority) break;
            this.heap[parentIndex] = item;
            this.heap[index] = parent;
            index = parentIndex;
        }
    }

    _sinkDown(index) {
        const length = this.heap.length;
        const item = this.heap[index];
        while (true) {
            let leftChildIndex = 2 * index + 1;
            let rightChildIndex = 2 * index + 2;
            let leftChild, rightChild;
            let swap = null;

            if (leftChildIndex < length) {
                leftChild = this.heap[leftChildIndex];
                if (leftChild.priority > item.priority) {
                    swap = leftChildIndex;
                }
            }

            if (rightChildIndex < length) {
                rightChild = this.heap[rightChildIndex];
                if (
                    (swap === null && rightChild.priority > item.priority) ||
                    (swap !== null && rightChild.priority > leftChild.priority)
                ) {
                    swap = rightChildIndex;
                }
            }

            if (swap === null) break;

            this.heap[index] = this.heap[swap];
            this.heap[swap] = item;
            index = swap;
        }
    }
}

export default PriorityQueue;