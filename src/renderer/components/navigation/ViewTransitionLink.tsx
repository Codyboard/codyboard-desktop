import { flushSync } from "react-dom";
import { Link, useNavigate, type LinkProps } from "react-router-dom";

export type ViewTransitionLinkProps = Omit<LinkProps, "state" | "viewTransition"> & { state?: unknown };

export function ViewTransitionLink({
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
    const transition = document.startViewTransition(() => {
      flushSync(() => { void navigate(to, { preventScrollReset, relative, replace, state }); });
    });
    void transition.finished.catch(() => undefined);
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
