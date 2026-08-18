import { flushSync } from "react-dom";
import { Link, useNavigate, type LinkProps } from "react-router-dom";

export type ViewTransitionLinkProps = Omit<LinkProps, "state" | "viewTransition"> & {
  direction?: "back" | "forward";
  state?: unknown;
};

export function ViewTransitionLink({
  direction = "forward",
  onClick,
  preventScrollReset,
  relative,
  reloadDocument,
  replace,
  state,
  target,
  to,
  ...props
}: ViewTransitionLinkProps) {
  const navigate = useNavigate();

  const navigateWithTransition: LinkProps["onClick"] = (event) => {
    onClick?.(event);
    if (
      event.defaultPrevented
      || reloadDocument
      || target && target !== "_self"
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || typeof document.startViewTransition !== "function"
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) return;

    event.preventDefault();
    const transitionClass = `route-transition-${direction}`;
    document.documentElement.classList.remove("route-transition-back", "route-transition-forward");
    document.documentElement.classList.add(transitionClass);
    const transition = document.startViewTransition(() => {
      flushSync(() => { void navigate(to, { preventScrollReset, relative, replace, state }); });
    });
    void transition.finished.catch(() => undefined).finally(() => {
      document.documentElement.classList.remove(transitionClass);
    });
  };

  return (
    <Link
      {...props}
      preventScrollReset={preventScrollReset}
      relative={relative}
      reloadDocument={reloadDocument}
      replace={replace}
      state={state}
      target={target}
      to={to}
      onClick={navigateWithTransition}
    />
  );
}
