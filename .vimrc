" Better Search
set incsearch
set ignorecase
set smartcase

" Plugin Indentation Based
filetype plugin indent on

" Trim and identify trailing white spaces
autocmd BufWritePre * :%s/\s\+$//e
highlight ExtraWhitespace ctermbg=red guibg=red
match ExtraWhitespace /\s\+$/
autocmd BufWinEnter * match ExtraWhitespace /\s\+$/
autocmd InsertEnter * match ExtraWhitespace /\s\+\%#\@<!$/
autocmd InsertLeave * match ExtraWhitespace /\s\+$/
autocmd BufWinLeave * call clearmatches()

" Enable Syntax Highlight
syntax on

" Select zellner colorscheme
colorscheme zellner
