import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { LEADS_PAGE_SIZE } from "@/hooks/useLeadsPaginated";

interface LeadsTablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export function LeadsTablePagination({
  currentPage,
  totalPages,
  totalCount,
  onPageChange,
}: LeadsTablePaginationProps) {
  if (totalPages <= 1) return null;

  const from = currentPage * LEADS_PAGE_SIZE + 1;
  const to = Math.min((currentPage + 1) * LEADS_PAGE_SIZE, totalCount);

  // Gerar números de página para exibir
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      // Mostrar todas as páginas
      for (let i = 0; i < totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Sempre mostrar primeira página
      pages.push(0);

      if (currentPage > 2) {
        pages.push('ellipsis');
      }

      // Páginas ao redor da atual
      const start = Math.max(1, currentPage - 1);
      const end = Math.min(totalPages - 2, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 3) {
        pages.push('ellipsis');
      }

      // Sempre mostrar última página
      pages.push(totalPages - 1);
    }

    return pages;
  };

  return (
    <div className="flex items-center justify-between px-2 py-4">
      <div className="text-sm text-muted-foreground">
        Exibindo {from} - {to} de {totalCount.toLocaleString('pt-BR')} leads
      </div>
      
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (currentPage > 0) onPageChange(currentPage - 1);
              }}
              className={currentPage === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
            />
          </PaginationItem>

          {getPageNumbers().map((page, index) => (
            <PaginationItem key={index}>
              {page === 'ellipsis' ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onPageChange(page);
                  }}
                  isActive={currentPage === page}
                  className="cursor-pointer"
                >
                  {page + 1}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}

          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (currentPage < totalPages - 1) onPageChange(currentPage + 1);
              }}
              className={currentPage >= totalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
