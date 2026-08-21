/**
 * Compatibility shim so the original DoctorPedAI page/component code that was
 * written against react-router-dom keeps working on TanStack Router.
 * TanStack Router remains the only router in the app.
 */
import * as React from "react";
import {
  Link as TanstackLink,
  Outlet as TanstackOutlet,
  useRouterState,
  useNavigate as useTanstackNavigate,
} from "@tanstack/react-router";

type AnyProps = Record<string, any>;

export const Link = React.forwardRef<HTMLAnchorElement, AnyProps>(
  ({ to, replace, state, ...rest }, ref) => {
    const target = typeof to === "string" ? to : (to?.pathname ?? "/");
    return <TanstackLink ref={ref as any} to={target} replace={replace} {...rest} />;
  },
);
Link.displayName = "Link";

export const NavLink = React.forwardRef<HTMLAnchorElement, AnyProps>(
  ({ to, className, children, ...rest }, ref) => {
    const target = typeof to === "string" ? to : (to?.pathname ?? "/");
    return (
      <TanstackLink
        ref={ref as any}
        to={target}
        {...rest}
        className={(state: any) =>
          typeof className === "function"
            ? className({ isActive: state.isActive, isPending: false })
            : className
        }
      >
        {typeof children === "function"
          ? (children as any)({ isActive: false, isPending: false })
          : children}
      </TanstackLink>
    );
  },
);
NavLink.displayName = "NavLink";

export const Outlet = TanstackOutlet;

export function useLocation() {
  return useRouterState({
    select: (s) => ({
      pathname: s.location.pathname,
      search: s.location.searchStr,
      hash: s.location.hash,
      state: s.location.state,
      key: s.location.href,
    }),
  });
}

export function useNavigationType() {
  return "PUSH";
}

export function useNavigate() {
  const navigate = useTanstackNavigate();
  return React.useCallback(
    (to: any, options?: any) => {
      if (typeof to === "number") {
        if (typeof window !== "undefined") window.history.go(to);
        return;
      }
      const target = typeof to === "string" ? to : (to?.pathname ?? "/");
      navigate({ to: target, replace: options?.replace });
    },
    [navigate],
  );
}

export function useParams() {
  return useRouterState({ select: (s) => (s.matches.at(-1)?.params ?? {}) as AnyProps });
}

export function useSearchParams(): [URLSearchParams, (next: any) => void] {
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const navigate = useTanstackNavigate();
  const params = React.useMemo(() => new URLSearchParams(searchStr), [searchStr]);
  const setParams = React.useCallback(
    (next: any) => {
      const value = next instanceof URLSearchParams ? next : new URLSearchParams(next);
      navigate({ to: `${window.location.pathname}?${value.toString()}` });
    },
    [navigate],
  );
  return [params, setParams];
}

export function Navigate({ to, replace }: AnyProps) {
  const navigate = useNavigate();
  React.useEffect(() => {
    navigate(to, { replace });
  }, [navigate, to, replace]);
  return null;
}

export default { Link, NavLink, Outlet, Navigate, useLocation, useNavigate, useParams };
