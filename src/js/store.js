import { createStore } from 'framework7';

const store = createStore({
  state: {
    user: null,      // data user login
    saldo: 0,        // saldo terkini
    tabungan: 0,     // tabungan terkini
  },
  getters: {
    user({ state }) { return state.user; },
    saldo({ state }) { return state.saldo; },
    tabungan({ state }) { return state.tabungan; },
  },
  actions: {
    // Set data user setelah login
    setUser({ state }, user) {
      state.user = user;
      state.saldo = parseFloat(user.saldo) || 0;
      state.tabungan = parseFloat(user.tabungan) || 0;
    },
    // Update saldo setelah transaksi
    updateSaldo({ state }, { saldo, tabungan }) {
      state.saldo = parseFloat(saldo) || state.saldo;
      if (tabungan !== undefined) state.tabungan = parseFloat(tabungan) || 0;
    },
    // Reset saat logout
    clearUser({ state }) {
      state.user = null;
      state.saldo = 0;
      state.tabungan = 0;
    }
  }
});

export default store;