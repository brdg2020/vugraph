#pragma once
// Tek iş parçacıklı WASM: libc++ thread tiplerinin boş taklitleri
#include <chrono>
#include <functional>
#include <utility>
#include <cstdlib>
namespace std {
struct mutex { void lock() {} void unlock() {} bool try_lock() { return true; } };

template <class M> struct unique_lock {
  M* m = nullptr; unique_lock() {} explicit unique_lock(M& x) : m(&x) {}
  void lock() {} void unlock() {} bool owns_lock() const { return true; }
};
struct condition_variable {
  void notify_one() {} void notify_all() {}
  template <class L> void wait(L&) {}
  template <class L, class P> void wait(L&, P p) { (void)p; }
  template <class L, class D, class P> bool wait_for(L&, D, P p) { return p(); }
};
struct thread {
  thread() {}
  template <class F, class... A> explicit thread(F&& f, A&&... a) { std::invoke(std::forward<F>(f), std::forward<A>(a)...); }
  bool joinable() const { return false; } void join() {} void detach() {}
  static unsigned hardware_concurrency() { return 1; }
};
namespace this_thread { template <class D> void sleep_for(const D&) {} }
}
