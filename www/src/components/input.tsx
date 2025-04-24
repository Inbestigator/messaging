export default function Input({
  className,
  ...data
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={
        "w-full bg-neutral-700 pl-1 text-sm text-white border-neutral-600 border-b " +
        className
      }
      type="text"
      {...data}
    />
  );
}
