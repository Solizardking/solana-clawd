import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
];

export function LanguageSelector() {
  const { i18n } = useTranslation();

  return (
    <Select
      value={i18n.language}
      onValueChange={(value) => i18n.changeLanguage(value)}
    >
      <SelectTrigger className="w-[140px] bg-black/40 border-purple-500/30 text-purple-200 hover:text-purple-100 transition-colors duration-300">
        <SelectValue>
          <span className="animate-in slide-in-from-right-4 duration-300">
            {languages.find(lang => lang.code === i18n.language)?.flag} {' '}
            {languages.find(lang => lang.code === i18n.language)?.name}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-black/90 border-purple-500/30">
        {languages.map((language) => (
          <SelectItem
            key={language.code}
            value={language.code}
            className="text-purple-200 hover:text-purple-100 hover:bg-purple-500/20 transition-colors duration-300"
          >
            <span className="animate-in slide-in-from-right-4 duration-300">
              {language.flag} {language.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}