import { Search } from 'lucide-react'

type SearchInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  id?: string
}

export default function SearchInput({ value, onChange, placeholder, id }: SearchInputProps) {
  return (
    <label className="search-field" htmlFor={id}>
      <Search size={16} aria-hidden="true" />
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </label>
  )
}
