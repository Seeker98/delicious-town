import { defineStore } from 'pinia';

export interface Toast {
  id: number;
  text: string;
  variant: 'success' | 'danger' | 'info';
}

let seq = 0;

export const useToastStore = defineStore('toast', {
  state: () => ({ items: [] as Toast[] }),
  actions: {
    push(text: string, variant: Toast['variant'] = 'success', ms = 3000) {
      const id = ++seq;
      this.items.push({ id, text, variant });
      if (this.items.length > 5) this.items.shift();
      setTimeout(() => this.remove(id), ms);
    },
    remove(id: number) {
      this.items = this.items.filter((t) => t.id !== id);
    },
  },
});
